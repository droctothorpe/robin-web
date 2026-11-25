import pytest

from app import rotation_ops as ops


def test_advance_moves_current_to_tail():
    assert ops.advance(["a", "b", "c"]) == ["b", "c", "a"]


def test_advance_single_member_is_noop():
    assert ops.advance(["a"]) == ["a"]


def test_bump_swaps_first_two_only():
    assert ops.bump(["a", "b", "c", "d"]) == ["b", "a", "c", "d"]


def test_dedupe_is_case_insensitive_and_trims():
    assert ops.dedupe(["  Alex ", "alex", "Sam", "", "SAM", "Priya"]) == ["Alex", "Sam", "Priya"]


def test_dedupe_rejects_too_many():
    with pytest.raises(ValueError):
        ops.dedupe([str(i) for i in range(ops.MAX_MEMBERS + 1)])


def test_find_is_case_insensitive():
    assert ops.find(["Alex", "Sam"], "sam") == 1
    assert ops.find(["Alex"], "nobody") == -1


def test_tokens_are_long_and_unique():
    a, b = ops.new_token(), ops.new_token()
    assert a != b and len(a) >= 22


def test_random_pick_never_repeats_within_a_round():
    members = ["a", "b", "c", "d"]
    already: list[str] = []
    seen = []
    for _ in range(4):
        picked, already = ops.random_pick(members, already)
        seen.append(picked)
    assert sorted(seen) == members
    # Fifth pick starts a new round
    picked, already = ops.random_pick(members, already)
    assert already == [picked]


def test_random_pick_forgets_departed_members():
    picked, already = ops.random_pick(["a", "b"], ["zed", "a"])
    assert picked == "b"
    assert already == ["a", "b"]
