set -eu

rm -rf docs
mkdir -p docs/blog
cp src/tufte.css docs/

PANDOC_OPTS="--from markdown --to html --template=layout/template.html --standalone"

for f in src/*.md; do
    [ -e "$f" ] || continue
    filename=$(basename "$f" .md)
    pandoc "$f" -o "docs/$filename.html" $PANDOC_OPTS --variable root_path=""
done

touch docs/manifest.txt

for f in src/blog/*.md; do
    [ -e "$f" ] || continue
    filename=$(basename "$f" .md)
    
    title=$(sed -n 's/^title: //p' "$f" | tr -d '"')
    date_str=$(sed -n 's/^date: //p' "$f" | tr -d '"')

    pandoc "$f" -o "docs/blog/$filename.html" $PANDOC_OPTS --variable root_path="../"

    echo "$date_str|$filename|$title" >> docs/manifest.txt
done

BLOG_LIST_ITEMS=""
while IFS="|" read -r date slug title; do
    BLOG_LIST_ITEMS="$BLOG_LIST_ITEMS<li>$date &mdash; <a href=\"blog/$slug.html\">$title</a></li>"
done < <(sort -r docs/manifest.txt)

cat <<EOF > docs/temp_blog_index.md
---
title: Blog Archive
---
<ul>
$BLOG_LIST_ITEMS
</ul>
EOF

pandoc docs/temp_blog_index.md -o docs/blog.html $PANDOC_OPTS --variable root_path=""

rm docs/temp_blog_index.md docs/manifest.txt