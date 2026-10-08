from django.db import migrations


def seed_free_plan(apps, schema_editor):
    SubscriptionPlan = apps.get_model('billing', 'SubscriptionPlan')
    if not SubscriptionPlan.objects.filter(is_free_default=True).exists():
        SubscriptionPlan.objects.create(
            name='Free',
            description='Default free plan. Up to 4 active products.',
            price_credits=0,
            max_active_products=4,
            allow_cart=False,
            can_view_viewers=False,
            can_view_favoriters=False,
            can_view_cart_users=False,
            can_view_clickers=False,
            visitor_detail_limit=4,
            is_free_default=True,
            is_active=True,
        )


def unseed_free_plan(apps, schema_editor):
    SubscriptionPlan = apps.get_model('billing', 'SubscriptionPlan')
    SubscriptionPlan.objects.filter(is_free_default=True, name='Free').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('billing', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(seed_free_plan, unseed_free_plan),
    ]
