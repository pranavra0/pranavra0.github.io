set -eu

STYLE="tufte.css"
NAV='<nav><a href="index.html">Home</a> \&nbsp; <a href="projects.html">Projects</a> \&nbsp; <a href="contact.html">Contact</a> \&nbsp; <a href="more.html">More</a></nav><hr>'
for f in src/*.html; do
    name=$(basename "$f" .html)
    title=$(echo "$name" | awk '{print toupper(substr($0,1,1)) substr($0,2)}')

    echo "Building $name..."

    cat layout/header.html "$f" layout/footer.html | \
    sed "s|{{TITLE}}|$title|g" | \
    sed "s|{{NAV}}|$NAV|g" | \
    sed "s|{{STYLE}}|$STYLE|g" > "$name.html"
done