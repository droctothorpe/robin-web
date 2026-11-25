"""Pure operations on an ordered member list."""

import secrets
from random import choice

MAX_MEMBERS = 200
MAX_NAME_LEN = 60


def new_token() -> str:
    return secrets.token_urlsafe(16)


def normalize_name(name: str) -> str:
    name = " ".join(name.split())
    if not name:
        raise ValueError("member name is empty")
    if len(name) > MAX_NAME_LEN:
        raise ValueError(f"member name longer than {MAX_NAME_LEN} characters")
    return name


def dedupe(names: list[str]) -> list[str]:
    """Normalize, drop blanks, and keep the first of any case-insensitive duplicates."""
    seen: set[str] = set()
    out: list[str] = []
    for raw in names:
        cleaned = " ".join(raw.split())
        if not cleaned:
            continue
        if len(cleaned) > MAX_NAME_LEN:
            raise ValueError(f"member name longer than {MAX_NAME_LEN} characters")
        key = cleaned.casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append(cleaned)
    if len(out) > MAX_MEMBERS:
        raise ValueError(f"more than {MAX_MEMBERS} members")
    return out


def find(members: list[str], name: str) -> int:
    key = name.casefold()
    for i, m in enumerate(members):
        if m.casefold() == key:
            return i
    return -1


def advance(members: list[str]) -> list[str]:
    """Current moves to the tail."""
    if len(members) < 2:
        return list(members)
    return members[1:] + members[:1]


def bump(members: list[str]) -> list[str]:
    """Current is skipped: they move to second place, the next member becomes Current."""
    if len(members) < 2:
        return list(members)
    return [members[1], members[0], *members[2:]]


def random_pick(members: list[str]) -> str:
    if not members:
        raise ValueError("no members to pick from")
    return choice(members)


def same_set(a: list[str], b: list[str]) -> bool:
    return sorted(x.casefold() for x in a) == sorted(x.casefold() for x in b)
