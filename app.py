from flask import Flask, request, jsonify, render_template
import os
import json
from docutils.core import publish_parts

app = Flask(__name__)

DOCS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), 'data', 'documents'))
FOLDERS_FILE = os.path.join(os.path.dirname(__file__), 'data', 'folders.json')
DOCS_META_FILE = os.path.join(os.path.dirname(__file__), 'data', 'docs_meta.json')

# 确保文档目录存在
if not os.path.exists(DOCS_DIR):
    try:
        os.makedirs(DOCS_DIR)
        print(f"Created documents directory at: {DOCS_DIR}")
    except Exception as e:
        print(f"Error creating documents directory: {str(e)}")
else:
    print(f"Documents directory exists at: {DOCS_DIR}")

def load_folders():
    if os.path.exists(FOLDERS_FILE):
        with open(FOLDERS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {'folders': []}

def save_folders(folders_data):
    with open(FOLDERS_FILE, 'w', encoding='utf-8') as f:
        json.dump(folders_data, f, ensure_ascii=False, indent=2)

def load_docs_meta():
    if os.path.exists(DOCS_META_FILE):
        with open(DOCS_META_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {'documents': {}}

def save_docs_meta(meta_data):
    with open(DOCS_META_FILE, 'w', encoding='utf-8') as f:
        json.dump(meta_data, f, ensure_ascii=False, indent=2)

def convert_rst_to_html(text):
    try:
        # 使用 docutils 将 RST 转换为 HTML
        parts = publish_parts(
            source=text,
            writer_name='html5',
            settings_overrides={
                'initial_header_level': 2,
                'doctitle_xform': False,
                'syntax_highlight': 'long',
                'pygments_style': 'default'
            }
        )
        return parts['html_body']
    except Exception as e:
        print(f"Error converting RST to HTML: {str(e)}")
        return f"<pre>{text}</pre>"  # 转换失败时返回原文本

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/documents', methods=['GET'])
def get_documents():
    documents = []
    docs_meta = load_docs_meta()
    for root, dirs, files in os.walk(DOCS_DIR):
        level = root.replace(DOCS_DIR, '').count(os.sep)
        for file in files:
            if file.endswith(('.md', '.rst')):  # 同时支持 .md 和 .rst 文件
                path = os.path.join(root, file)
                relative_path = os.path.relpath(path, DOCS_DIR)
                meta = docs_meta['documents'].get(relative_path, {})
                documents.append({
                    'id': relative_path,
                    'name': file,
                    'path': relative_path,
                    'level': level,
                    'folder_id': meta.get('folder_id', None)
                })
    return jsonify(documents)

@app.route('/api/documents/<path:doc_path>', methods=['GET'])
def get_document(doc_path):
    try:
        with open(os.path.join(DOCS_DIR, doc_path), 'r', encoding='utf-8') as f:
            content = f.read()
        return jsonify({'content': content})
    except FileNotFoundError:
        return jsonify({'error': 'Document not found'}), 404

@app.route('/api/documents/<path:doc_path>', methods=['POST'])
def save_document(doc_path):
    print(f"Received request to save document: {doc_path}")
    content = request.json.get('content')
    if content is None:
        print("No content provided in request")
        return jsonify({'error': 'No content provided'}), 400
    
    try:
        full_path = os.path.join(DOCS_DIR, doc_path)
        print(f"Attempting to save file to: {full_path}")
        
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        
        dir_path = os.path.dirname(full_path)
        if not os.access(dir_path, os.W_OK):
            print(f"No write permission for directory: {dir_path}")
            return jsonify({'error': 'No write permission for directory'}), 403
        
        with open(full_path, 'w', encoding='utf-8') as f:
            f.write(content or '')
        print(f"Successfully saved document to: {full_path}")
        return jsonify({'message': 'Document saved successfully'})
    except Exception as e:
        error_msg = f"Error saving document: {str(e)}"
        print(error_msg)
        return jsonify({'error': error_msg}), 500

@app.route('/api/documents/<path:doc_path>', methods=['DELETE'])
def delete_document(doc_path):
    try:
        full_path = os.path.join(DOCS_DIR, doc_path)
        if os.path.exists(full_path):
            os.remove(full_path)
            return jsonify({'message': 'Document deleted successfully'})
        return jsonify({'error': 'Document not found'}), 404
    except Exception as e:
        error_msg = f"Error deleting document: {str(e)}"
        print(error_msg)
        return jsonify({'error': error_msg}), 500

@app.route('/api/folders', methods=['GET'])
def get_folders():
    return jsonify(load_folders())

@app.route('/api/folders', methods=['POST'])
def create_folder():
    data = request.json
    if not data or 'name' not in data:
        return jsonify({'error': 'No folder name provided'}), 400
    
    folders_data = load_folders()
    parent_id = data.get('parent_id', None)
    
    new_folder = {
        'id': str(len(folders_data['folders']) + 1),
        'name': data['name'],
        'parent_id': parent_id,
        'expanded': True
    }
    
    folders_data['folders'].append(new_folder)
    save_folders(folders_data)
    return jsonify(new_folder)

@app.route('/api/folders/<folder_id>/toggle', methods=['POST'])
def toggle_folder(folder_id):
    folders_data = load_folders()
    for folder in folders_data['folders']:
        if folder['id'] == folder_id:
            folder['expanded'] = not folder.get('expanded', True)
            save_folders(folders_data)
            return jsonify({'expanded': folder['expanded']})
    return jsonify({'error': 'Folder not found'}), 404

@app.route('/api/folders/<folder_id>/rename', methods=['POST'])
def rename_folder(folder_id):
    data = request.json
    if not data or 'name' not in data:
        return jsonify({'error': 'No folder name provided'}), 400
    
    folders_data = load_folders()
    for folder in folders_data['folders']:
        if folder['id'] == folder_id:
            folder['name'] = data['name']
            save_folders(folders_data)
            return jsonify(folder)
    return jsonify({'error': 'Folder not found'}), 404

@app.route('/api/documents/<path:doc_path>/rename', methods=['POST'])
def rename_document(doc_path):
    data = request.json
    if not data or 'name' not in data:
        return jsonify({'error': 'No document name provided'}), 400
    
    if not (data['name'].endswith('.md') or data['name'].endswith('.rst')):
        return jsonify({'error': 'Document name must end with .md or .rst'}), 400
    
    try:
        old_path = os.path.join(DOCS_DIR, doc_path)
        new_path = os.path.join(DOCS_DIR, os.path.dirname(doc_path), data['name'])
        
        if os.path.exists(new_path):
            return jsonify({'error': 'Document with this name already exists'}), 400
        
        os.rename(old_path, new_path)
        docs_meta = load_docs_meta()
        if doc_path in docs_meta['documents']:
            folder_id = docs_meta['documents'][doc_path].get('folder_id')
            docs_meta['documents'].pop(doc_path)
            new_relative_path = os.path.relpath(new_path, DOCS_DIR)
            docs_meta['documents'][new_relative_path] = {'folder_id': folder_id}
            save_docs_meta(docs_meta)
        
        return jsonify({'message': 'Document renamed successfully', 'new_path': os.path.relpath(new_path, DOCS_DIR)})
    except Exception as e:
        error_msg = f"Error renaming document: {str(e)}"
        print(error_msg)
        return jsonify({'error': error_msg}), 500

@app.route('/api/documents/<path:doc_path>/move', methods=['POST'])
def move_document(doc_path):
    data = request.json
    if 'folder_id' not in data:
        return jsonify({'error': 'No folder_id provided'}), 400
    
    try:
        docs_meta = load_docs_meta()
        if doc_path not in docs_meta['documents']:
            docs_meta['documents'][doc_path] = {}
        
        docs_meta['documents'][doc_path]['folder_id'] = data['folder_id']
        save_docs_meta(docs_meta)
        return jsonify({'message': 'Document moved successfully'})
    except Exception as e:
        error_msg = f"Error moving document: {str(e)}"
        print(error_msg)
        return jsonify({'error': error_msg}), 500

@app.route('/api/folders/<folder_id>', methods=['DELETE'])
def delete_folder(folder_id):
    try:
        # 加载文件夹数据
        folders_data = load_folders()
        # 加载文档元数据
        docs_meta = load_docs_meta()
        
        # 查找要删除的文件夹
        folder_to_delete = None
        for folder in folders_data['folders']:
            if folder['id'] == folder_id:
                folder_to_delete = folder
                break
        
        if not folder_to_delete:
            return jsonify({'error': 'Folder not found'}), 404
        
        # 获取文件夹中的所有文档
        docs_to_delete = []
        for doc_path, meta in docs_meta['documents'].items():
            if meta.get('folder_id') == folder_id:
                docs_to_delete.append(doc_path)
        
        # 删除文件夹中的所有文档
        for doc_path in docs_to_delete:
            full_path = os.path.join(DOCS_DIR, doc_path)
            if os.path.exists(full_path):
                os.remove(full_path)
                docs_meta['documents'].pop(doc_path, None)
        
        # 从文件夹表中删除文件夹
        folders_data['folders'] = [f for f in folders_data['folders'] if f['id'] != folder_id]
        
        # 保存更新后的数据
        save_folders(folders_data)
        save_docs_meta(docs_meta)
        
        return jsonify({'message': 'Folder and its contents deleted successfully'})
    except Exception as e:
        error_msg = f"Error deleting folder: {str(e)}"
        print(error_msg)
        return jsonify({'error': error_msg}), 500

@app.route('/api/preview', methods=['POST'])
def preview_document():
    content = request.json.get('content')
    doc_type = request.json.get('type', 'md')  # 默认为 markdown
    
    if not content:
        return jsonify({'html': ''})
    
    try:
        if doc_type == 'rst':
            html = convert_rst_to_html(content)
        else:  # markdown
            # 保持原有的 markdown 处理逻辑
            return jsonify({'html': content})
        
        return jsonify({'html': html})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True) 