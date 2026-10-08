import logging

from app.auth.service.email_service import EmailService
from app.billing.models.notification import Notification

logger = logging.getLogger(__name__)


def notify(user, notif_type, title, message, data=None, email=True):
    """Create an in-app notification and best-effort send an email.

    Never raises: notification/email failures must not break the calling flow
    (approvals, charging, maintenance jobs).
    """
    notification = None
    try:
        notification = Notification.objects.create(
            user=user,
            notif_type=notif_type,
            title=title,
            message=message,
            data=data or {},
        )
    except Exception:
        logger.exception('Failed to create notification %s for user %s', notif_type, getattr(user, 'pk', None))

    if email and getattr(user, 'email', None):
        try:
            EmailService().send_email(user.email, title, message)
        except Exception:
            logger.exception('Failed to send notification email %s to %s', notif_type, user.email)

    return notification
