from rest_framework import serializers

from core.models import Application, Branch, LoanScheme


class LoanSchemeSerializer(serializers.ModelSerializer):
    class Meta:
        model = LoanScheme
        fields = "__all__"


class BranchSerializer(serializers.ModelSerializer):
    class Meta:
        model = Branch
        fields = "__all__"


class ApplicationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Application
        fields = "__all__"
