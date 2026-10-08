def payment_method_dict(pm):
    return {
        'id': pm.id,
        'method_type': pm.method_type,
        'provider_name': pm.provider_name,
        'account_holder': pm.account_holder,
        'account_number': pm.account_number,
        'instructions': pm.instructions,
        'is_active': pm.is_active,
        'sort_order': pm.sort_order,
    }


def ledger_entry_dict(entry):
    return {
        'id': entry.id,
        'entry_type': entry.entry_type,
        'entry_type_display': entry.get_entry_type_display(),
        'amount': str(entry.amount),
        'balance_before': str(entry.balance_before),
        'balance_after': str(entry.balance_after),
        'description': entry.description,
        'reference_type': entry.reference_type,
        'reference_id': entry.reference_id,
        'created_at': entry.created_at.isoformat(),
    }


def topup_dict(topup, request=None):
    screenshot_url = None
    if topup.screenshot:
        screenshot_url = topup.screenshot.url
        if request is not None:
            screenshot_url = request.build_absolute_uri(screenshot_url)
    return {
        'id': topup.id,
        'vendor_id': topup.vendor_id,
        'vendor_username': getattr(topup.vendor, 'username', None),
        'amount': str(topup.amount),
        'transaction_id': topup.transaction_id,
        'screenshot_url': screenshot_url,
        'payment_method': payment_method_dict(topup.payment_method) if topup.payment_method else None,
        'payment_method_id': topup.payment_method_id,
        'status': topup.status,
        'status_display': topup.get_status_display(),
        'rejection_reason': topup.rejection_reason,
        'info_request_message': topup.info_request_message,
        'vendor_note': topup.vendor_note,
        'reviewed_by_username': getattr(topup.reviewed_by, 'username', None),
        'reviewed_at': topup.reviewed_at.isoformat() if topup.reviewed_at else None,
        'created_at': topup.created_at.isoformat(),
        'updated_at': topup.updated_at.isoformat(),
    }


def topup_audit_dict(log):
    return {
        'id': log.id,
        'action': log.action,
        'action_display': log.get_action_display(),
        'actor_id': log.actor_id,
        'actor_username': getattr(log.actor, 'username', None),
        'previous_state': log.previous_state,
        'new_state': log.new_state,
        'created_at': log.created_at.isoformat(),
    }


def _format_remaining(delta):
    total_seconds = delta.total_seconds()
    if total_seconds <= 0:
        return None
    days = delta.days
    months, rem_days = divmod(days, 30)
    parts = []
    if months:
        parts.append(f"{months} month{'s' if months != 1 else ''}")
    if rem_days or not months:
        parts.append(f"{rem_days} day{'s' if rem_days != 1 else ''}")
    return ', '.join(parts) + ' remaining'


def plan_dict(plan):
    return {
        'id': plan.id,
        'name': plan.name,
        'description': plan.description,
        'price_credits': str(plan.price_credits),
        'max_active_products': plan.max_active_products,
        'allow_cart': plan.allow_cart,
        'can_view_viewers': plan.can_view_viewers,
        'can_view_favoriters': plan.can_view_favoriters,
        'can_view_cart_users': plan.can_view_cart_users,
        'can_view_clickers': plan.can_view_clickers,
        'visitor_detail_limit': plan.visitor_detail_limit,
        'features': plan.features,
        'is_free_default': plan.is_free_default,
        'is_active': plan.is_active,
    }


def subscription_dict(sub):
    from django.utils import timezone

    now = timezone.now()
    is_live = sub.status == 'ACTIVE' and sub.expires_at > now
    remaining = sub.expires_at - now if is_live else None

    return {
        'id': sub.id,
        'plan': plan_dict(sub.plan),
        'status': sub.status,
        'started_at': sub.started_at.isoformat(),
        'expires_at': sub.expires_at.isoformat(),
        'credits_paid': str(sub.credits_paid),
        'renewal_count': sub.renewal_count,
        'renewed_from_id': sub.renewed_from_id,
        'cancel_at_period_end': sub.cancel_at_period_end,
        'cancelled_at': sub.cancelled_at.isoformat() if sub.cancelled_at else None,
        'cancelled_by_username': getattr(sub.cancelled_by, 'username', None),
        'remaining_days': max(remaining.days, 0) if remaining else 0,
        'remaining_text': _format_remaining(remaining) if remaining else None,
        'created_at': sub.created_at.isoformat(),
    }


def history_status_for(sub, renewed_from_ids):
    """A subscription row's raw `status` says EXPIRED both when it lapsed
    unrenewed and when it was renewed right on time — both just mean "not
    the current row anymore". For a per-vendor history timeline that's
    misleading, so compute a friendlier label: if some later subscription's
    `renewed_from` points at this row, it was superseded by an on-time
    renewal, not a lapse.
    """
    if sub.status in ('ACTIVE', 'CANCELLED'):
        return sub.status
    return 'RENEWED' if sub.id in renewed_from_ids else 'EXPIRED'


def history_list(subs, renewed_from_ids=None):
    """`renewed_from_ids` should cover the vendor's *entire* history, not just
    the page being rendered — otherwise a row renewed by something on another
    page would wrongly show as a lapse. Pass it in explicitly when paginating
    (see `vendor_renewed_from_ids`); only safe to omit when `subs` is the
    vendor's full history already.
    """
    subs = list(subs)
    if renewed_from_ids is None:
        renewed_from_ids = {s.renewed_from_id for s in subs if s.renewed_from_id}
    results = []
    for s in subs:
        d = subscription_dict(s)
        d['history_status'] = history_status_for(s, renewed_from_ids)
        results.append(d)
    return results


def vendor_renewed_from_ids(vendor):
    from app.billing.models import VendorSubscription

    return set(
        VendorSubscription.objects.filter(vendor=vendor, renewed_from_id__isnull=False)
        .values_list('renewed_from_id', flat=True)
    )


def audit_log_dict(log):
    return {
        'id': log.id,
        'action': log.action,
        'action_display': log.get_action_display(),
        'actor_id': log.actor_id,
        'actor_username': getattr(log.actor, 'username', None),
        'reason': log.reason,
        'previous_state': log.previous_state,
        'new_state': log.new_state,
        'created_at': log.created_at.isoformat(),
    }


def notification_dict(n):
    return {
        'id': n.id,
        'notif_type': n.notif_type,
        'title': n.title,
        'message': n.message,
        'data': n.data,
        'is_read': n.is_read,
        'created_at': n.created_at.isoformat(),
    }
