set -eu
shopt -u patsub_replacement 2>/dev/null || true
STYLE="tufte.css"
NAV='<nav><a href="index.html">Home</a> &nbsp; <a href="projects.html">Projects</a> &nbsp; <a href="contact.html">Contact</a> &nbsp; <a href="more.html">More</a></nav><hr>'
HEADER=$(<layout/header.html)
FOOTER=$(<layout/footer.html)
HEADER="${HEADER//\{\{NAV\}\}/$NAV}"
HEADER="${HEADER//\{\{STYLE\}\}/$STYLE}"
for f in src/*.html; do
    fn="${f##*/}"
    name="${fn%.*}"
    title="${name^}"
    body=$(<"$f")
    full_page="${HEADER}${body}${FOOTER}"
    final_html="${full_page//\{\{TITLE\}\}/$title}"
    printf "%s" "$final_html" > "$name.html"
done