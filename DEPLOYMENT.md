# ============================================================
# DEPLOYMENT GUIDE — AWS Production Setup
# CRM ERP System
# ============================================================

## Architecture Overview
- EC2 (t3.medium) — Nginx + Gunicorn (Django)
- RDS MySQL 8.0     — Primary database
- ElastiCache Redis — Celery broker + cache
- S3 Bucket         — Media files + static assets
- SES               — Transactional email
- CloudWatch        — Monitoring + alerts
- Route 53          — DNS management
- ACM               — SSL certificate
- ECS (optional)    — Containerised deployment with auto-scaling

---

## STEP 1 — AWS Infrastructure Setup

### 1.1 VPC + Security Groups
```bash
# Create VPC with public and private subnets
# Public subnet: Nginx/EC2
# Private subnet: RDS, ElastiCache

# Security group: Backend
# Inbound: port 8000 from Nginx SG, port 22 from your IP
# Security group: RDS
# Inbound: port 3306 from Backend SG only
# Security group: Redis
# Inbound: port 6379 from Backend SG only
```

### 1.2 RDS MySQL Setup
```bash
aws rds create-db-instance \
  --db-instance-identifier crm-erp-mysql \
  --db-instance-class db.t3.medium \
  --engine mysql \
  --engine-version 8.0 \
  --master-username admin \
  --master-user-password YOUR_STRONG_PASSWORD \
  --allocated-storage 50 \
  --storage-type gp3 \
  --multi-az \
  --backup-retention-period 7 \
  --vpc-security-group-ids sg-xxxxxxxx \
  --db-subnet-group-name crm-erp-subnet-group
```

### 1.3 ElastiCache Redis
```bash
aws elasticache create-cache-cluster \
  --cache-cluster-id crm-erp-redis \
  --engine redis \
  --cache-node-type cache.t3.micro \
  --num-cache-nodes 1 \
  --security-group-ids sg-xxxxxxxx
```

### 1.4 S3 Bucket
```bash
aws s3 mb s3://crm-erp-media --region ap-south-1
aws s3api put-bucket-cors --bucket crm-erp-media \
  --cors-configuration '{
    "CORSRules": [{
      "AllowedOrigins": ["https://yourcrm.com"],
      "AllowedMethods": ["GET","PUT","POST"],
      "AllowedHeaders": ["*"]
    }]
  }'
```

---

## STEP 2 — EC2 Server Setup

### 2.1 Launch EC2 (Ubuntu 22.04 LTS, t3.medium)
```bash
# Connect to your instance
ssh -i your-key.pem ubuntu@YOUR_EC2_IP

# Update + install dependencies
sudo apt update && sudo apt upgrade -y
sudo apt install -y python3.11 python3.11-venv python3-pip \
    nginx mysql-client redis-tools git certbot python3-certbot-nginx

# Create app user
sudo useradd -m -s /bin/bash crmapp
sudo su - crmapp
```

### 2.2 Clone and configure
```bash
cd /home/crmapp
git clone https://github.com/your-org/crm-erp.git
cd crm-erp/backend

python3.11 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Create .env file
cat > .env << 'EOF'
DEBUG=False
DJANGO_SECRET_KEY=your-very-long-random-secret-key-here
ALLOWED_HOSTS=yourcrm.com,api.yourcrm.com,YOUR_EC2_IP

DB_HOST=crm-erp-mysql.xxxx.rds.amazonaws.com
DB_NAME=crm_erp
DB_USER=admin
DB_PASSWORD=your_rds_password

REDIS_URL=redis://crm-erp-redis.xxxx.cache.amazonaws.com:6379/0

AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_STORAGE_BUCKET_NAME=crm-erp-media
AWS_S3_REGION_NAME=ap-south-1

WHATSAPP_API_TOKEN=your_whatsapp_token
WHATSAPP_PHONE_ID=your_phone_number_id
WHATSAPP_VERIFY_TOKEN=your_custom_verify_token

DEFAULT_FROM_EMAIL=noreply@yourcrm.com
CORS_ALLOWED_ORIGINS=https://yourcrm.com,https://app.yourcrm.com
EOF

# Run migrations
python manage.py migrate
python manage.py collectstatic --noinput
python manage.py createsuperuser
```

### 2.3 Gunicorn systemd service
```bash
# /etc/systemd/system/crm-erp.service
sudo tee /etc/systemd/system/crm-erp.service > /dev/null << 'EOF'
[Unit]
Description=CRM ERP Gunicorn Server
After=network.target

[Service]
User=crmapp
Group=crmapp
WorkingDirectory=/home/crmapp/crm-erp/backend
ExecStart=/home/crmapp/crm-erp/backend/venv/bin/gunicorn \
    --workers 4 \
    --worker-class gthread \
    --threads 2 \
    --bind unix:/run/crm-erp.sock \
    --access-logfile /var/log/crm-erp/access.log \
    --error-logfile /var/log/crm-erp/error.log \
    wsgi:application
Restart=always

[Install]
WantedBy=multi-user.target
EOF

sudo mkdir -p /var/log/crm-erp
sudo chown crmapp:crmapp /var/log/crm-erp
sudo systemctl daemon-reload
sudo systemctl enable crm-erp
sudo systemctl start crm-erp
```

### 2.4 Celery worker + beat services
```bash
# /etc/systemd/system/crm-erp-celery.service
sudo tee /etc/systemd/system/crm-erp-celery.service > /dev/null << 'EOF'
[Unit]
Description=CRM ERP Celery Worker
After=network.target

[Service]
User=crmapp
WorkingDirectory=/home/crmapp/crm-erp/backend
ExecStart=/home/crmapp/crm-erp/backend/venv/bin/celery \
    -A core worker --loglevel=info --concurrency=4 \
    --logfile=/var/log/crm-erp/celery.log
Restart=always

[Install]
WantedBy=multi-user.target
EOF

# /etc/systemd/system/crm-erp-beat.service
sudo tee /etc/systemd/system/crm-erp-beat.service > /dev/null << 'EOF'
[Unit]
Description=CRM ERP Celery Beat Scheduler
After=network.target

[Service]
User=crmapp
WorkingDirectory=/home/crmapp/crm-erp/backend
ExecStart=/home/crmapp/crm-erp/backend/venv/bin/celery \
    -A core beat --loglevel=info \
    --scheduler django_celery_beat.schedulers:DatabaseScheduler \
    --logfile=/var/log/crm-erp/beat.log
Restart=always

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable crm-erp-celery crm-erp-beat
sudo systemctl start  crm-erp-celery crm-erp-beat
```

### 2.5 Nginx configuration
```bash
sudo tee /etc/nginx/sites-available/crm-erp > /dev/null << 'EOF'
server {
    listen 80;
    server_name yourcrm.com api.yourcrm.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.yourcrm.com;

    ssl_certificate     /etc/letsencrypt/live/api.yourcrm.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourcrm.com/privkey.pem;

    location /api/ {
        proxy_pass          http://unix:/run/crm-erp.sock;
        proxy_set_header    Host              $host;
        proxy_set_header    X-Real-IP         $remote_addr;
        proxy_set_header    X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header    X-Forwarded-Proto $scheme;
        client_max_body_size 50M;
    }

    location /admin/ {
        proxy_pass http://unix:/run/crm-erp.sock;
        proxy_set_header Host $host;
    }

    location /static/ {
        alias /home/crmapp/crm-erp/backend/staticfiles/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/crm-erp /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# SSL certificate
sudo certbot --nginx -d api.yourcrm.com -d yourcrm.com
```

---

## STEP 3 — Frontend Deployment (React + Vite)

```bash
cd /home/crmapp/crm-erp/frontend

# Create production .env
echo "VITE_API_BASE_URL=https://api.yourcrm.com/api" > .env.production

npm install
npm run build
# Output in dist/

# Serve with Nginx (add to nginx config above):
# location / {
#   root /home/crmapp/crm-erp/frontend/dist;
#   try_files $uri $uri/ /index.html;
# }

# OR deploy to S3 + CloudFront (recommended):
aws s3 sync dist/ s3://crm-erp-frontend --delete
aws cloudfront create-invalidation \
    --distribution-id YOUR_CLOUDFRONT_ID \
    --paths "/*"
```

---

## STEP 4 — WhatsApp Business API Setup

```
1. Create Meta Business Account at business.facebook.com
2. Set up WhatsApp Business Platform in Meta Developer Console
3. Create a WhatsApp Business App
4. Add a phone number and complete verification
5. Generate a permanent access token (System User token)
6. Configure webhook:
   - URL: https://api.yourcrm.com/api/whatsapp/webhook/
   - Verify Token: set in your .env as WHATSAPP_VERIFY_TOKEN
   - Subscribe to: messages, message_deliveries, message_reads
7. Create message templates in Meta Business Suite
   Required templates:
   - fee_reminder      (body with {{1}} = name, {{2}} = amount)
   - birthday_wish     (body with {{1}} = name)
   - first_class_reminder (body with {{1}} = name, {{2}} = date)
   - walkin_reminder   (body with {{1}} = name, {{2}} = branch)
   - followup          (body with {{1}} = name, {{2}} = course)
8. After template approval (24–48 hrs), update template names in automation.py
```

---

## STEP 5 — CI/CD with GitHub Actions

```yaml
# .github/workflows/deploy.yml
name: Deploy to AWS

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Deploy to EC2
        uses: appleboy/ssh-action@v1.0.0
        with:
          host:     ${{ secrets.EC2_HOST }}
          username: crmapp
          key:      ${{ secrets.EC2_PRIVATE_KEY }}
          script: |
            cd /home/crmapp/crm-erp
            git pull origin main
            source backend/venv/bin/activate
            cd backend
            pip install -r requirements.txt
            python manage.py migrate
            python manage.py collectstatic --noinput
            sudo systemctl restart crm-erp crm-erp-celery crm-erp-beat

      - name: Deploy Frontend to S3
        run: |
          cd frontend
          npm install
          npm run build
          aws s3 sync dist/ s3://crm-erp-frontend --delete
          aws cloudfront create-invalidation \
            --distribution-id ${{ secrets.CLOUDFRONT_ID }} \
            --paths "/*"
        env:
          AWS_ACCESS_KEY_ID:     ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
```

---

## STEP 6 — Monitoring & Alerting

```bash
# Install CloudWatch Agent
sudo apt install -y amazon-cloudwatch-agent

# Configure CloudWatch to ship /var/log/crm-erp/ logs
# Set alarms for:
# - EC2 CPU > 80% for 5 min
# - RDS FreeStorageSpace < 5 GB
# - 5xx error rate > 1%
# - Celery queue depth > 100

# Health check endpoint (add to Django)
# GET /api/health/ → {"status": "ok", "db": "ok", "redis": "ok"}
```

---

## Quick Reference — Environment Variables

| Variable                   | Description                        |
|----------------------------|------------------------------------|
| DJANGO_SECRET_KEY          | Django secret (50+ random chars)   |
| DB_HOST / DB_NAME / DB_USER / DB_PASSWORD | MySQL RDS connection  |
| REDIS_URL                  | ElastiCache endpoint               |
| AWS_ACCESS_KEY_ID + SECRET | S3 / SES credentials               |
| AWS_STORAGE_BUCKET_NAME    | S3 bucket for media                |
| WHATSAPP_API_TOKEN         | Meta Business API token            |
| WHATSAPP_PHONE_ID          | WhatsApp Business phone number ID  |
| WHATSAPP_VERIFY_TOKEN      | Webhook verification secret        |
| CORS_ALLOWED_ORIGINS       | Frontend domain(s)                 |
| DEFAULT_FROM_EMAIL         | SES from address                   |
