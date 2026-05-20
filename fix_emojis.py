#!/usr/bin/env python3
"""
Replace emojis in HTML files (outside <script> blocks) with SVG equivalents or text.
"""

import re
import os
import glob

# ─── SVG map ────────────────────────────────────────────────────────────────

SVG = {
    '📆': '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    '📝': '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
    '👷': '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    '👔': '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>',
    '🚐': '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>',
    '🚔': '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/><line x1="5" y1="3" x2="5" y2="1"/><line x1="19" y1="3" x2="19" y2="1"/></svg>',
    '📸': '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
    '📷': '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
    '🧠': '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a5 5 0 0 1 5 5c0 1.7-.85 3.2-2.14 4.1A5 5 0 0 1 17 16c0 2.76-2.24 5-5 5s-5-2.24-5-5a5 5 0 0 1 2.14-4.9A5 5 0 0 1 7 7a5 5 0 0 1 5-5z"/></svg>',
    '📡': '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>',
    '💾': '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17,21 17,13 7,13 7,21"/><polyline points="7,3 7,8 15,8"/></svg>',
    '💶': '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
    '🕐': '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    '🧾': '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
    '🗑': '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>',
    '👁': '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
    '🍪': '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8.56 2.75c4.37 6.03 6.02 9.42 8.03 17.72m2.54-15.38c-3.72 4.35-8.94 5.66-16.88 5.85m19.5 1.9c-3.5-.93-6.63-.82-8.94 0-2.58.92-5.01 2.86-7.44 6.32"/></svg>',
    '📋': '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 0-2 2H6a2 2 0 0 0-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>',
    '🖨️': '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>',
    '📥': '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    '✏': '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
    '📤': '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
    '📁': '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
    '📎': '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>',
    '📏': '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 6H3a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2z"/><line x1="9" y1="6" x2="9" y2="10"/><line x1="15" y1="6" x2="15" y2="10"/><line x1="12" y1="6" x2="12" y2="12"/></svg>',
}

# Text replacements for sun/moon emojis used as AM/PM/Nuit labels
TEXT_REPLACEMENTS = {
    '🌅': 'AM',
    '🌆': 'PM',
    '🌙': 'Nuit',
}

# Emojis to keep as-is (do not replace)
KEEP_AS_IS = {
    '👋',   # greeting
    '🔄',   # in JS
    '📌',   # in JS strings for absence labels
    '📚',   # in JS strings
    '🏖️',  # in JS strings
    '🤒',   # in JS strings
    '🎉',   # in JS strings (also in parametres labels - keep)
    '✕',    # UI char (not emoji)
    '✓',    # UI char
    '⚠',   # UI char
    '🔧',   # in JS strings / option values kept as decorative
    '🔗',   # in JS strings
    '💬',   # in JS toast strings
    '✓✓',  # UI char
    # Special emojis in option values (decorative, keep):
    '🚨', '🅿️', '🚦', '📱', '🪢', '⚖️', '⏱️',
    '🔑', '🔌', '🔩', '🛞', '🛑', '❄️', '🪟', '🧹', '⚡',
    '🥇', '🥈', '🥉', '🧪', '💳', '🔐',
    '🏘️', '🚫', '🏷️', '📌',
    '🟢', '☀️',
    # chauffeur_vue specific - keep these as decorative/label chars
    '🔙', '🪑', '🧴', '🏪',
}

# Build a combined pattern for all emojis we DO replace
REPLACE_EMOJIS = set(SVG.keys()) | set(TEXT_REPLACEMENTS.keys())

def replace_in_html_segment(text):
    """Replace emojis in an HTML segment (not inside script tags)."""
    changes = []
    result = text

    # Process each emoji we want to replace
    for emoji, replacement in {**SVG, **TEXT_REPLACEMENTS}.items():
        if emoji in result:
            count = result.count(emoji)
            result = result.replace(emoji, replacement)
            if count > 0:
                changes.append(f"  {repr(emoji)} → replaced {count}x")

    return result, changes


def process_file(filepath):
    """Process a single HTML file."""
    with open(filepath, 'r', encoding='utf-8') as f:
        original = f.read()

    # Split into segments: even indices = HTML, odd indices = <script>...</script>
    # Use re.split with a capturing group so we keep the script blocks
    script_pattern = re.compile(r'(<script[\s\S]*?</script>)', re.IGNORECASE)
    parts = script_pattern.split(original)

    new_parts = []
    all_changes = []

    for i, part in enumerate(parts):
        if i % 2 == 0:
            # HTML segment — apply replacements
            new_part, changes = replace_in_html_segment(part)
            new_parts.append(new_part)
            all_changes.extend(changes)
        else:
            # Script segment — keep verbatim
            new_parts.append(part)

    new_content = ''.join(new_parts)

    if new_content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        return True, all_changes
    return False, []


def main():
    html_dir = '/home/user/ST-CO'
    html_files = sorted(glob.glob(os.path.join(html_dir, '*.html')))

    print(f"Processing {len(html_files)} HTML files in {html_dir}\n")
    print("=" * 60)

    total_changed = 0

    for filepath in html_files:
        filename = os.path.basename(filepath)
        changed, changes = process_file(filepath)
        if changed:
            total_changed += 1
            print(f"\n✔ {filename} — MODIFIED")
            for c in changes:
                print(c)
        else:
            print(f"  {filename} — no changes")

    print("\n" + "=" * 60)
    print(f"\nDone. {total_changed}/{len(html_files)} files modified.")


if __name__ == '__main__':
    main()
