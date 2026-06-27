from pathlib import Path

DST = Path.home()/'Brainz'/'odysseus'/'data'/'skills'/'brainz'
# Be conservative: only flip skills the Hermes system contract + skill-output-map
# explicitly authorise to write state. Reviewer-flagged additions included:
# hermes-appliance (writes case records + promotions), hyperresearch (research outputs).
MUTATING = {
    'coder', 'github-scout', 'pr-reviewer', 'securitybot', 'security-and-hardening',
    'sysbot', 'mining-ops-bot', 'tradingdesk', 'sportsclaw', 'researcher',
    'portfolio', 'shipping-and-launch', 'deprecation-and-migration', 'incremental-implementation',
    'hermes-appliance', 'hyperresearch', 'interview-me', 'idea-refine',
}
flipped = 0; already_true = 0; missing = 0
for sid in MUTATING:
    fp = DST/f'{sid}'/'SKILL.md'
    if not fp.exists(): missing += 1; continue
    txt = fp.read_text(encoding='utf-8')
    new = txt.replace('mutating: false', 'mutating: true')
    if new != txt:
        fp.write_text(new, encoding='utf-8')
        flipped += 1
    else:
        already_true += 1
print(f'flipped: {flipped}    already-true: {already_true}    not-found: {missing}')
