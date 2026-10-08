def campaign_product_dict(cp, request=None):
    product = cp.product
    image_url = None
    if product.image:
        image_url = product.image.url
        if request is not None:
            image_url = request.build_absolute_uri(image_url)
    return {
        'product_id': cp.product_id,
        'product_name': product.name,
        'product_image': image_url,
        'is_active': product.is_active,
        'objectives': cp.objectives(),
    }


def campaign_display_status(campaign):
    """COMPLETED covers a manual stop, a cancelled draft, and a natural
    1-month finish — disambiguate using the terminal audit-log action,
    mirroring billing's history_status pattern."""
    if campaign.status != campaign.COMPLETED:
        return campaign.status, campaign.get_status_display()

    from app.campaigns.models import CampaignAuditLog

    terminal_log = campaign.audit_logs.filter(
        action__in=[CampaignAuditLog.STOPPED, CampaignAuditLog.CANCELLED, CampaignAuditLog.COMPLETED]
    ).order_by('-created_at').first()
    action = terminal_log.action if terminal_log else None
    if action == CampaignAuditLog.CANCELLED:
        return 'CANCELLED', 'Cancelled (never started)'
    if action == CampaignAuditLog.STOPPED:
        return 'STOPPED', 'Stopped early'
    return 'COMPLETED', 'Completed'


def campaign_dict(campaign, request=None, include_products=True):
    display_status, display_status_label = campaign_display_status(campaign)
    data = {
        'id': campaign.id,
        'name': campaign.name,
        'vendor_id': campaign.vendor_id,
        'vendor_username': getattr(campaign.vendor, 'username', None),
        'status': campaign.status,
        'status_display': campaign.get_status_display(),
        'display_status': display_status,
        'display_status_label': display_status_label,
        'total_budget': str(campaign.total_budget),
        'spent': str(campaign.spent),
        'remaining': str(campaign.remaining),
        'started_at': campaign.started_at.isoformat() if campaign.started_at else None,
        'ends_at': campaign.ends_at.isoformat() if campaign.ends_at else None,
        'completed_at': campaign.completed_at.isoformat() if campaign.completed_at else None,
        'created_at': campaign.created_at.isoformat(),
    }
    if include_products:
        data['products'] = [campaign_product_dict(cp, request) for cp in campaign.products.select_related('product')]
    return data


def audit_log_dict(log):
    return {
        'id': log.id,
        'action': log.action,
        'action_display': log.get_action_display(),
        'actor': getattr(log.actor, 'username', None),
        'actor_role': getattr(log.actor, 'role', None),
        'previous_state': log.previous_state,
        'new_state': log.new_state,
        'reason': log.reason,
        'created_at': log.created_at.isoformat(),
    }


def pricing_dict(pricing):
    return {
        'cost_per_view': str(pricing.cost_per_view),
        'cost_per_favorite': str(pricing.cost_per_favorite),
        'cost_per_cart_add': str(pricing.cost_per_cart_add),
        'cost_per_link_click': str(pricing.cost_per_link_click),
        'updated_at': pricing.updated_at.isoformat() if pricing.updated_at else None,
    }
