import re
from urllib.parse import quote

import requests
from django.conf import settings
from django.utils import timezone


PLACEHOLDER_PATTERN = re.compile(r'{{\s*([\w]+)\s*}}')


def normalize_candidate_phone(phone):
    digits = re.sub(r'\D', '', str(phone or ''))
    if digits.startswith('0') and len(digits) == 11:
        digits = digits[1:]
    country_code = str(getattr(settings, 'DEFAULT_WHATSAPP_COUNTRY_CODE', '91') or '91')
    if len(digits) == 10:
        digits = f'{country_code}{digits}'
    if not digits.startswith(country_code) or len(digits) != len(country_code) + 10:
        return ''
    return digits


def render_message(body, values):
    message = body or ''

    def replace(match):
        return str(values.get(match.group(1), '') or '')

    return PLACEHOLDER_PATTERN.sub(replace, message).strip()


def template_parameters(values):
    return [
        {'name': key, 'value': str(value or '')}
        for key, value in values.items()
    ]


class WATIClient:
    def __init__(self):
        self.base_url = getattr(settings, 'WATI_API_URL', '').rstrip('/')
        self.access_token = getattr(settings, 'WATI_ACCESS_TOKEN', '')
        self.instance_id = getattr(settings, 'WATI_INSTANCE_ID', '')
        self.headers = {
            'Authorization': f'Bearer {self.access_token}',
            'Content-Type': 'application/json',
        }

    @property
    def is_configured(self):
        return bool(self.base_url and self.access_token)

    def send_session_message(self, phone, message):
        if not self.is_configured:
            return {'error': 'WATI is not configured.'}
        url = f'{self.base_url}/api/v1/sendSessionMessage/{phone}'
        response = requests.post(
            url,
            params={'messageText': message},
            headers=self.headers,
            timeout=15,
        )
        return self._response_payload(response)

    def send_session_file(self, phone, file_bytes, filename, caption='', content_type='application/pdf'):
        if not self.is_configured:
            return {'error': 'WATI is not configured.'}
        url = f'{self.base_url}/api/v1/sendSessionFile/{phone}'
        headers = {'Authorization': f'Bearer {self.access_token}'}
        files = {'file': (filename, file_bytes, content_type or 'application/octet-stream')}
        data = {'caption': caption or ''}
        response = requests.post(
            url,
            files=files,
            data=data,
            headers=headers,
            timeout=30,
        )
        return self._response_payload(response)

    def send_template_message(self, phone, template_name, values, language_code='en'):
        if not self.is_configured:
            return {'error': 'WATI is not configured.'}
        url = f'{self.base_url}/api/v1/sendTemplateMessage'
        payload = {
            'template_name': template_name,
            'broadcast_name': template_name,
            'parameters': template_parameters(values),
        }
        if language_code:
            payload['language'] = language_code
        response = requests.post(
            url,
            params={'whatsappNumber': phone},
            json=payload,
            headers=self.headers,
            timeout=15,
        )
        return self._response_payload(response)

    def _response_payload(self, response):
        try:
            data = response.json()
        except ValueError:
            data = {'raw': response.text}
        if response.status_code >= 400:
            return {'error': data.get('message') or data.get('error') or response.text, 'response': data}
        if data.get('result') is False:
            return {'error': data.get('info') or data.get('message') or 'WATI rejected the message.', 'response': data}
        return data


def already_sent_today(message_type, related_model, related_id, phone):
    from crm.models import WhatsAppMessage

    today = timezone.localdate()
    return WhatsAppMessage.objects.filter(
        message_type=message_type,
        related_model=related_model,
        related_id=related_id,
        recipient_phone=phone,
        status__in=[WhatsAppMessage.MsgStatus.SENT, WhatsAppMessage.MsgStatus.DELIVERED, WhatsAppMessage.MsgStatus.READ],
        created_at__date=today,
    ).first()


def log_whatsapp_message(
    *,
    candidate_name,
    phone,
    message_type,
    message_body,
    result,
    template_name='',
    sent_by=None,
    related_model='',
    related_id=None,
    provider='wati',
):
    from crm.models import WhatsAppMessage

    log = WhatsAppMessage.objects.create(
        candidate_name=candidate_name or '',
        recipient_phone=phone,
        template_name=template_name or '',
        message_body=message_body,
        message_type=message_type,
        sent_by=sent_by,
        related_model=related_model,
        related_id=related_id,
        provider=provider,
        provider_response=result if isinstance(result, dict) else {'result': str(result)},
    )
    if result.get('error'):
        log.status = WhatsAppMessage.MsgStatus.FAILED
        log.error_message = str(result.get('error'))
    else:
        log.status = WhatsAppMessage.MsgStatus.SENT
        log.wa_message_id = (
            result.get('id')
            or result.get('messageId')
            or result.get('message_id')
            or result.get('messages', [{}])[0].get('id', '')
        )
        log.sent_at = timezone.now()
    log.save()
    return log


def whatsapp_web_url(phone, message):
    normalized_phone = normalize_candidate_phone(phone)
    if not normalized_phone:
        return ''
    return f'https://wa.me/{normalized_phone}?text={quote(message or "")}'


def send_whatsapp_message(
    *,
    candidate_name,
    phone,
    message_type,
    message_body,
    sent_by=None,
    related_model='',
    related_id=None,
    provider='whatsapp_web',
):
    """Provider abstraction for WhatsApp sending.

    Current provider opens WhatsApp Web. WATI can be wired here later without
    changing callers.
    """
    normalized_phone = normalize_candidate_phone(phone)
    if not normalized_phone:
        return log_whatsapp_message(
            candidate_name=candidate_name,
            phone=str(phone or ''),
            message_type=message_type,
            message_body=message_body,
            result={'error': 'Invalid candidate phone number.'},
            sent_by=sent_by,
            related_model=related_model,
            related_id=related_id,
            provider=provider,
        )

    url = whatsapp_web_url(normalized_phone, message_body)
    return log_whatsapp_message(
        candidate_name=candidate_name,
        phone=normalized_phone,
        message_type=message_type,
        message_body=message_body,
        result={'provider': provider, 'whatsapp_url': url},
        template_name='WhatsApp Web',
        sent_by=sent_by,
        related_model=related_model,
        related_id=related_id,
        provider=provider,
    )


def send_candidate_message(
    *,
    candidate_name,
    phone,
    message_type,
    message_body,
    template=None,
    values=None,
    sent_by=None,
    related_model='',
    related_id=None,
    dedupe=True,
):
    normalized_phone = normalize_candidate_phone(phone)
    if not normalized_phone:
        return log_whatsapp_message(
            candidate_name=candidate_name,
            phone=str(phone or ''),
            message_type=message_type,
            message_body=message_body,
            result={'error': 'Invalid candidate phone number.'},
            template_name=getattr(template, 'name', ''),
            sent_by=sent_by,
            related_model=related_model,
            related_id=related_id,
        )

    if dedupe and related_model and related_id:
        existing = already_sent_today(message_type, related_model, related_id, normalized_phone)
        if existing:
            return existing

    client = WATIClient()
    values = values or {}
    rendered_body = render_message(message_body, values)
    wati_template_name = getattr(template, 'wati_template_name', '') if template else ''
    if wati_template_name:
        result = client.send_template_message(
            normalized_phone,
            wati_template_name,
            values,
            getattr(template, 'wati_language_code', 'en') or 'en',
        )
        template_name = wati_template_name
    else:
        result = client.send_session_message(normalized_phone, rendered_body)
        template_name = getattr(template, 'name', '')

    return log_whatsapp_message(
        candidate_name=candidate_name,
        phone=normalized_phone,
        message_type=message_type,
        message_body=rendered_body,
        result=result,
        template_name=template_name,
        sent_by=sent_by,
        related_model=related_model,
        related_id=related_id,
    )


def send_candidate_document(
    *,
    candidate_name,
    phone,
    message_type,
    caption,
    file_bytes,
    filename,
    content_type='application/pdf',
    sent_by=None,
    related_model='',
    related_id=None,
):
    normalized_phone = normalize_candidate_phone(phone)
    if not normalized_phone:
        return log_whatsapp_message(
            candidate_name=candidate_name,
            phone=str(phone or ''),
            message_type=message_type,
            message_body=caption,
            result={'error': 'Invalid candidate phone number.'},
            sent_by=sent_by,
            related_model=related_model,
            related_id=related_id,
        )

    result = WATIClient().send_session_file(normalized_phone, file_bytes, filename, caption, content_type)
    return log_whatsapp_message(
        candidate_name=candidate_name,
        phone=normalized_phone,
        message_type=message_type,
        message_body=caption,
        result=result,
        template_name=filename,
        sent_by=sent_by,
        related_model=related_model,
        related_id=related_id,
    )
