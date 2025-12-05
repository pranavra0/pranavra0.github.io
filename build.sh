set -eu

STYLE="tufte.css"
NAV='<nav><a href="index.html">Home</a> &nbsp; <a href="projects.html">Projects</a> &nbsp; <a href="contact.html">Contact</a> &nbsp; <a href="more.html">More</a></nav><hr>'

for f in src/*.md; do
    name=$(basename "$f" .md)
    title=$(head -n 1 "$f")
    [ -z "$title" ] && title="$name"

    echo "Building $name..."

    cat > "$name.html" <<EOF
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>$name | PRANAV RAO</title>
    <link rel="stylesheet" href="$STYLE">
</head>
<body>
    <header>$NAV</header>
    <article>
EOF
    pandoc "$f" -f markdown -t html >> "$name.html"
    cat >> "$name.html" <<EOF
    </article>
</body>
</html>
EOF
done