from django.contrib import admin
from .models.scrapeModel import ScrapedProduct, Categories, productClick


@admin.register(ScrapedProduct)
class ScrapedProductAdmin(admin.ModelAdmin):
    list_display = ('id', 'title', 'User_name', 'category', 'price', 'url', 'scraped_at')
    list_filter = ('category', 'scraped_at')
    search_fields = ('title', 'url', 'description', 'User_name__username')
    ordering = ('-scraped_at',)
    raw_id_fields = ('User_name', 'category')


@admin.register(Categories)
class CategoriesAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'User_name', 'is_active', 'created_at')
    list_filter = ('is_active', 'created_at')
    search_fields = ('name', 'User_name__username')
    ordering = ('-created_at',)


@admin.register(productClick)
class productClickAdmin(admin.ModelAdmin):
    list_display = ('id', 'User_name', 'product', 'scrape_click_count', 'web_click_count')
    search_fields = ('User_name__username', 'product__title')
