# Robin: domain glossary

Robin equitably distributes recurring work across a team by taking turns.

## Terms

**Rotation**
: An ordered list of Members plus its settings and history. The thing a
  person creates and shares. Informally "a list", but never called that in
  code or UI as a standalone noun.

**Member**
: A name on a Rotation. Not an account; carries no identity beyond the
  text of the name.

**Current**
: The Member at the head of a Rotation. The person whose turn it is.

**Advance**
: Move the Current Member to the tail so the next Member becomes Current.
  May be triggered by a person or by the Rotation's Schedule.

**Bump**
: Skip the Current Member because they are unavailable: they move to second
  position and the next Member becomes Current.

**Undo**
: Revert the most recent Advance or Bump, restoring the previous Current. Only
  available while nothing else has changed the order since.

**Random pick**
: Choose one Member at random without changing the Rotation's order. Picks
  are drawn without replacement within a Round.

**Round**
: One pass of Random picks in which every Member is picked exactly once.
  When the last unpicked Member is drawn, the next pick starts a new Round.

**Schedule**
: A rule that Advances the Rotation automatically at set times, expressed as
  a preset (daily, weekdays, weekly, every N weeks, monthly) with a time of
  day and a timezone.

**Edit link**
: The unguessable URL that grants full access to a Rotation. Holding it is
  the only credential. Anyone with it can view, change, and delete the
  Rotation.

**View link**
: A second unguessable URL that grants read-only access to a Rotation.

**Audit entry**
: A record of one change to a Rotation: what happened, when, and the
  display name of whoever did it (or "Schedule" when automatic).

**Display name**
: An unverified name a visitor supplies so Audit entries can be attributed.
  Remembered in their browser, not an account.

**Webhook**
: An optional URL the Rotation posts to whenever Current changes.
