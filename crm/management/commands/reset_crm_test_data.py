from crm.management.commands.reset_demo_data import Command


Command.help = (
    'Compatibility alias for reset_demo_data. Safely deletes CRM demo/test '
    'transactional data only after super-admin authorization.'
)
