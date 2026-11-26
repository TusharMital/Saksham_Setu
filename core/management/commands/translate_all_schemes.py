"""Management command to batch-translate all 66 schemes into target language(s) via Groq."""

from django.core.management import BaseCommand, call_command

from core.dynamic_translator import translate_schemes
from core.languages import SUPPORTED_LANGUAGES
from core.models import LoanScheme


class Command(BaseCommand):
    help = "Translate all 66 loan schemes into a target language or 'all' using persistent cache + Groq."

    def add_arguments(self, parser):
        parser.add_argument(
            "--lang",
            default="hi",
            help="Target language code (e.g. hi) or 'all' for all 22 non-English languages.",
        )
        parser.add_argument(
            "--batch-size",
            type=int,
            default=2,
            help="Number of schemes per Groq translation batch.",
        )

    def handle(self, *args, **options):
        if LoanScheme.objects.count() < 66:
            call_command("seed_data")

        raw_lang = str(options["lang"] or "hi").strip().lower()
        batch_size = max(1, min(6, int(options["batch_size"] or 2)))

        if raw_lang == "all":
            targets = [code for code in SUPPORTED_LANGUAGES if code != "en"]
        else:
            targets = [raw_lang]

        for lang_code in targets:
            res = translate_schemes(None, lang_code, batch_size=batch_size)
            self.stdout.write(
                f"{lang_code}: cached={res['cached_count']}, "
                f"translated={res['translated_count']}, fallback={res['fallback_count']}"
            )
