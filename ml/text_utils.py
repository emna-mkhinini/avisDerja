import re
import unicodedata

ARABIC = re.compile(r"[؀-ۿ]")


def is_arabic_script(text: str) -> bool:
    return bool(ARABIC.search(unicodedata.normalize("NFKC", str(text))))


def normalize(text: str) -> str:
    """Normalisation légère pour le derja (écriture arabe et latine)."""
    # NFKC ramène les « formes de présentation » arabes (ﺍﻟﺤﻮﺕ) vers les lettres normales
    s = unicodedata.normalize("NFKC", str(text)).lower()
    s = re.sub(r"https?://\S+", " ", s)
    s = re.sub(r"(.)\1{2,}", r"\1\1", s)  # « hhhhhh » -> « hh », « barchaaaa » -> « barchaa »
    s = re.sub(r"[إأآ]", "ا", s)
    s = s.replace("ة", "ه").replace("ى", "ي")
    s = re.sub(r"[ً-ْ]", "", s)  # diacritiques
    return re.sub(r"\s+", " ", s).strip()
