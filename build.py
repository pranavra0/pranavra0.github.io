import os
import shutil
import yaml
import markdown
from jinja2 import Environment, FileSystemLoader

# --- CONFIGURATION ---
CONTENT_DIR = 'content'
TEMPLATE_DIR = 'templates'
STATIC_DIR = 'static'
OUTPUT_DIR = 'output'

def clean_output():
    if os.path.exists(OUTPUT_DIR):
        shutil.rmtree(OUTPUT_DIR)
    os.makedirs(OUTPUT_DIR)

def load_content(filepath):

    with open(filepath, 'r', encoding='utf-8') as f:
        raw_content = f.read()
    
    # Split YAML front matter (between --- and ---)
    if raw_content.startswith('---'):
        try:
            _, front_matter, content = raw_content.split('---', 2)
            metadata = yaml.safe_load(front_matter)
        except ValueError:
            print(f"Warning: Formatting error in {filepath}")
            metadata = {}
            content = raw_content
    else:
        metadata = {}
        content = raw_content
        
    return metadata, content

def build():
    print("Building site...")
    clean_output()

    env = Environment(loader=FileSystemLoader(TEMPLATE_DIR))

    for root, dirs, files in os.walk(CONTENT_DIR):
        for filename in files:
            if not filename.endswith('.md'):
                continue
            
            filepath = os.path.join(root, filename)
            metadata, md_content = load_content(filepath)
            
            html_content = markdown.markdown(md_content)
            
            # Determine output path
            rel_path = os.path.relpath(filepath, CONTENT_DIR)
            output_rel_path = rel_path.replace('.md', '.html')
            output_path = os.path.join(OUTPUT_DIR, output_rel_path)
            
            os.makedirs(os.path.dirname(output_path), exist_ok=True)
            
            template_name = metadata.get('template', 'default.html')
            try:
                template = env.get_template(template_name)
            except:
                print(f"Template '{template_name}' not found, using base.")
                template = env.get_template('base.html')

            # Render Template with Context
            context = {
                'title': metadata.get('title', 'No Title'),
                'content': html_content,
                'meta': metadata 
            }
            
            output_html = template.render(context)
            
            with open(output_path, 'w', encoding='utf-8') as f:
                f.write(output_html)
            
            print(f"Generated: {output_rel_path}")

    if os.path.exists(STATIC_DIR):
        # copy to output/static to keep root clean
        output_static = os.path.join(OUTPUT_DIR, 'static')
        shutil.copytree(STATIC_DIR, output_static)
        print("Copied static assets.")



if __name__ == "__main__":
    build()