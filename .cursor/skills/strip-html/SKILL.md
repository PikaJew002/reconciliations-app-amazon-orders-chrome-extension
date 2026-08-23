---
name: strip-html
description: Removes <script> and <style> tags from HTML files and compact whitespace in place. Use when the user asks to clean, strip, compact, or re-run the HTML cleaner on test.html or another HTML dump, especially Amazon page markup.
---

# Strip HTML

Clean HTML dumps by executing the bundled script. Do not reimplement this with inline Python.

## Run

From the project root:

```bash
python3 .cursor/skills/strip-html/scripts/strip-html.py
```

That overwrites `test.html`. For another file:

```bash
python3 .cursor/skills/strip-html/scripts/strip-html.py path/to/file.html
```

Write somewhere else instead of overwriting:

```bash
python3 .cursor/skills/strip-html/scripts/strip-html.py path/to/file.html -o path/to/cleaned.html
```

## After running

Report the script's stats (original vs new line/byte counts, remaining script/style tags). Do not paste the cleaned HTML unless asked.
