new Vue({
    el: '#app',
    delimiters: ['[[', ']]'],  // 更改定界符，避免与Flask模板冲突
    data: {
        documents: [],
        folders: [],
        currentDoc: null,
        documentContent: '',
        renderedContent: '',
        showMoveToFolder: false,
        docToMove: null,
        itemToRename: null,
        rootExpanded: true,
        draggedItem: null,
        dragOverItem: null,
        autoSaveTimer: null,
        lastSavedContent: '',
        saveStatus: '',
        currentDocType: 'md',
        scrolling: false  // 添加滚动状态标记
    },
    computed: {
        foldersTree() {
            const buildTree = (parentId = null, level = 0) => {
                return this.folders
                    .filter(f => f.parent_id === parentId)
                    .map(folder => ({
                        ...folder,
                        level,
                        documents: this.documents.filter(d => {
                            if (d.folder_id === folder.id) {
                                d.id = `${folder.id}/${d.name}`;
                                return true;
                            }
                            return false;
                        }),
                        expanded: folder.expanded !== false
                    }));
            };
            const tree = buildTree();
            const unclassifiedDocs = this.documents.filter(d => {
                if (!d.folder_id) {
                    d.id = `root/${d.name}`;
                    return true;
                }
                return false;
            });
            if (unclassifiedDocs.length > 0) {
                tree.unshift({
                    id: 'root',
                    name: '未分类文档',
                    level: 0,
                    documents: unclassifiedDocs,
                    expanded: this.rootExpanded !== false
                });
            }
            return tree;
        }
    },
    mounted() {
        this.loadDocuments();
        this.loadFolders();
        this.initializeMarked();
        this.initializeScrollSync();
    },
    beforeDestroy() {
        this.stopAutoSave();
    },
    watch: {
        // 监听文档内容变化
        documentContent(newContent) {
            this.updatePreview();
            // 内容变化时更新保存状态
            if (this.lastSavedContent !== newContent) {
                this.saveStatus = '未保存';
            }
        }
    },
    methods: {
        initializeMarked() {
            if (typeof marked === 'undefined') {
                console.error('Marked library not loaded');
                this.marked = text => text;
                return;
            }
            this.marked = marked.parse;
            this.marked.setOptions({
                breaks: true,
                gfm: true,
                pedantic: false,
                smartLists: true,
                smartypants: true
            });
        },
        
        async loadDocuments() {
            try {
                const response = await fetch('/api/documents');
                this.documents = await response.json();
                if (this.documents.length > 0) {
                    const unclassifiedDoc = this.documents.find(doc => !doc.folder_id);
                    if (unclassifiedDoc) {
                        await this.openDocument(unclassifiedDoc);
                    } else {
                        await this.openDocument(this.documents[0]);
                    }
                }
            } catch (error) {
                console.error('Error loading documents:', error);
            }
        },
        
        async openDocument(doc) {
            this.currentDoc = doc;
            this.currentDocType = doc.name.endsWith('.rst') ? 'rst' : 'md';
            
            try {
                const response = await fetch(`/api/documents/${doc.path}`);
                const data = await response.json();
                this.documentContent = data.content;
                this.lastSavedContent = data.content;
                this.saveStatus = '已保存';
                this.updatePreview();
                this.startAutoSave();
            } catch (error) {
                console.error('Error opening document:', error);
            }
        },
        
        async updatePreview() {
            if (!this.documentContent) {
                this.renderedContent = '';
                return;
            }
            
            try {
                if (this.currentDocType === 'rst') {
                    // 使用后端 API 转换 RST
                    const response = await fetch('/api/preview', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            content: this.documentContent,
                            type: 'rst'
                        })
                    });
                    
                    if (!response.ok) {
                        throw new Error('预览生成失败');
                    }
                    
                    const data = await response.json();
                    this.renderedContent = data.html;
                } else {
                    // Markdown 处理保持不变
                    this.renderedContent = marked.parse(this.documentContent);
                }
                // 更新预览后重置滚动位置
                this.$nextTick(() => {
                    const editor = document.querySelector('textarea');
                    const preview = document.querySelector('.preview');
                    // 重新初始化滚动同步
                    this.initializeScrollSync();
                    const percentage = editor.scrollTop / (editor.scrollHeight - editor.clientHeight);
                    preview.scrollTop = percentage * (preview.scrollHeight - preview.clientHeight);
                });
            } catch (error) {
                console.error('Error parsing document:', error);
                this.renderedContent = this.documentContent;
            }
        },
        
        async saveDocument(isAutoSave = false) {
            if (!this.currentDoc) return;
            
            try {
                const response = await fetch(`/api/documents/${this.currentDoc.path}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        content: this.documentContent
                    })
                });
                
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || '保存失败');
                }
                
                this.lastSavedContent = this.documentContent;
                this.saveStatus = '已保存';
                if (!isAutoSave) {
                    alert('文档保存成功！');
                }
            } catch (error) {
                console.error('Error saving document:', error);
                this.saveStatus = '保存失败';
                if (!isAutoSave) {
                    alert(`保存失败：${error.message}`);
                }
                throw error;
            }
        },
        
        async createNewDocument() {
            const name = prompt('请输入文档名称（以.md或.rst结尾）：');
            if (!name) return;
            
            if (!name.endsWith('.md') && !name.endsWith('.rst')) {
                alert('文档名称必须.md或.rst结尾');
                return;
            }
            
            this.currentDocType = name.endsWith('.rst') ? 'rst' : 'md';
            
            const newDoc = {
                id: `root/${name}`,
                name: name,
                path: name,
                level: 0,
                folder_id: null
            };
            
            try {
                const response = await fetch(`/api/documents/${name}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        content: ''
                    })
                });
                
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || '创建文档失败');
                }
                
                this.documents.push(newDoc);
                this.currentDoc = newDoc;
                this.documentContent = '';
                this.updatePreview();
            } catch (error) {
                console.error('Error creating document:', error.message);
                alert(`创建文档失败：${error.message}`);
            }
        },
        
        async deleteDocument(doc) {
            if (!confirm(`确定要删除文档 "${doc.name}" 吗？`)) {
                return;
            }
            
            try {
                const response = await fetch(`/api/documents/${doc.path}`, {
                    method: 'DELETE'
                });
                
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || '删除失败');
                }
                
                const index = this.documents.findIndex(d => d.id === doc.id);
                if (index !== -1) {
                    this.documents.splice(index, 1);
                }
                
                if (this.currentDoc && this.currentDoc.id === doc.id) {
                    this.currentDoc = null;
                    this.documentContent = '';
                    this.renderedContent = '';
                }
            } catch (error) {
                console.error('Error deleting document:', error);
                alert(`删除失败：${error.message}`);
            }
        },
        
        handleDragStart(event, doc) {
            this.draggedItem = doc;
            event.target.classList.add('dragging');
            // 设置拖动时的数据
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', doc.id);
        },
        
        handleDragOver(event, target) {
            // 添加视觉反馈
            const element = target.folder_id !== undefined 
                ? event.target.closest('.doc-item')
                : event.target.closest('.folder-header');
            
            if (element) {
                element.classList.add('drag-over');
            }
        },
        
        handleDragLeave(event) {
            // 移除视觉反馈
            const element = event.target.closest('.doc-item, .folder-header');
            if (element) {
                element.classList.remove('drag-over');
            }
        },
        
        handleDragEnd(event) {
            event.target.classList.remove('dragging');
            this.draggedItem = null;
            // 移除所有拖拽相关的样式
            document.querySelectorAll('.drag-over').forEach(el => {
                el.classList.remove('drag-over');
            });
        },
        
        async handleDrop(event, target) {
            event.target.classList.remove('drag-over');
            
            if (!this.draggedItem || !this.draggedItem.path) {
                console.error('Invalid dragged item');
                return;
            }
            
            try {
                // 保存拖动项的路径以供后续使用
                const draggedPath = this.draggedItem.path;
                
                // 如果目标是文件夹
                if (!('folder_id' in target)) {
                    // 直接移动到目标文件夹
                    const response = await fetch(`/api/documents/${draggedPath}/move`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            folder_id: target.id === 'root' ? null : target.id
                        })
                    });
                    
                    if (!response.ok) {
                        const error = await response.json();
                        throw new Error(error.error || '移动失败');
                    }
                    
                    // 先重新加载文档列表
                    await this.loadDocuments();
                    
                    // 在重新加载后，重新查找要移动的文档
                    const updatedDoc = this.documents.find(d => d.path === draggedPath);
                    if (updatedDoc) {
                        updatedDoc.folder_id = target.id === 'root' ? null : target.id;
                    }
                    
                    return;
                }
                
                // 如果目标是文档，交换位置
                // 获取拖动文档和目标文档的基本名称（不包含文件夹ID）
                const draggedBaseName = this.draggedItem.name;
                const targetBaseName = target.name;
                
                // 在文档列表中查找对应的索引
                const draggedIndex = this.documents.findIndex(d => d.name === draggedBaseName && d.folder_id === this.draggedItem.folder_id);
                const targetIndex = this.documents.findIndex(d => d.name === targetBaseName && d.folder_id === target.folder_id);
                
                if (draggedIndex !== -1 && targetIndex !== -1) {
                    // 移除拖动的文档
                    const [draggedDoc] = this.documents.splice(draggedIndex, 1);
                    // 在目标位置插入
                    this.documents.splice(targetIndex, 0, draggedDoc);
                    
                    // 如果目标文档在文件夹中，将拖动的文档也移动到同一文件夹
                    if (target.folder_id !== undefined && target.folder_id !== draggedDoc.folder_id) {
                        const response = await fetch(`/api/documents/${draggedPath}/move`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                folder_id: target.folder_id
                            })
                        });
                        
                        if (!response.ok) {
                            const error = await response.json();
                            throw new Error(error.error || '移动失败');
                        }
                        
                        // 先重新加载文档列表
                        await this.loadDocuments();
                        
                        // 在重新加载后，重新查找要移动的文档
                        const updatedDoc = this.documents.find(d => d.path === draggedPath);
                        if (updatedDoc) {
                            updatedDoc.folder_id = target.folder_id;
                        }
                    }
                }
            } catch (error) {
                console.error('Error handling drop:', error);
                alert(error.message || '移动文档失败');
                // 重新加载文档列表以恢复原始状态
                await this.loadDocuments();
            } finally {
                this.draggedItem = null;
            }
        },
        
        async loadFolders() {
            try {
                const response = await fetch('/api/folders');
                const data = await response.json();
                this.folders = data.folders;
            } catch (error) {
                console.error('Error loading folders:', error);
            }
        },
        
        async createNewFolder() {
            const name = prompt('请输入文件夹名称：');
            if (!name) return;
            
            try {
                const response = await fetch('/api/folders', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ name })
                });
                
                if (!response.ok) {
                    throw new Error('创建文件夹失败');
                }
                
                const newFolder = await response.json();
                this.folders.push(newFolder);
            } catch (error) {
                console.error('Error creating folder:', error);
                alert('创建文件夹失败');
            }
        },
        
        async toggleFolder(folder) {
            if (folder.id === 'root') {
                this.rootExpanded = !this.rootExpanded;
                return;
            }
            
            try {
                const response = await fetch(`/api/folders/${folder.id}/toggle`, {
                    method: 'POST'
                });
                
                if (!response.ok) {
                    throw new Error('切换文件夹状态失败');
                }
                
                const data = await response.json();
                folder.expanded = data.expanded;
                this.$forceUpdate();
            } catch (error) {
                console.error('Error toggling folder:', error);
                alert('切换文件夹状态失败');
            }
        },
        
        async moveToFolder(folder) {
            if (!this.docToMove || !this.docToMove.path) {
                console.error('Invalid document to move');
                return;
            }
            
            try {
                const response = await fetch(`/api/documents/${this.docToMove.path}/move`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        folder_id: folder ? folder.id : null
                    })
                });
                
                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error || '移动失败');
                }
                
                const docPath = this.docToMove.path; // 保存路径以供后续使用
                
                // 先重新加载文档列表以确保状态正确
                await this.loadDocuments();
                
                // 在重新加载后，重新查找要移动的文档
                const updatedDoc = this.documents.find(d => d.path === docPath);
                if (updatedDoc) {
                    updatedDoc.folder_id = folder ? folder.id : null;
                    // 更新文档的ID
                    updatedDoc.id = folder ? `${folder.id}/${updatedDoc.name}` : `root/${updatedDoc.name}`;
                    this.$forceUpdate();
                }
                
                this.showMoveToFolder = false;
                this.docToMove = null;
            } catch (error) {
                console.error('Error moving document:', error);
                alert(error.message || '移动文档失败');
                // 移动失败时重新加载文档列表以恢复原始状态
                await this.loadDocuments();
                this.showMoveToFolder = false;
                this.docToMove = null;
            }
        },
        
        startRename(item, event) {
            this.itemToRename = item;
            // 使用Vue.nextTick确保DOM更新后再聚焦输入框
            this.$nextTick(() => {
                const input = document.createElement('input');
                input.value = item.name;
                input.className = 'rename-input';
                
                // 如果是通过按钮点击，使用父元素查找
                const nameSpan = event.target.tagName === 'BUTTON' 
                    ? event.target.closest('.doc-item, .folder-header').querySelector('.folder-name, .doc-name')
                    : event.target;
                const originalDisplay = nameSpan.style.display;
                nameSpan.style.display = 'none';
                nameSpan.parentNode.insertBefore(input, nameSpan);
                
                input.focus();
                input.select();
                
                const finishRename = async () => {
                    const newName = input.value.trim();
                    try {
                        if (newName && newName !== item.name) {
                            await this.renameItem(item, newName);
                            input.remove();
                            nameSpan.style.display = originalDisplay;
                            this.itemToRename = null;
                        } else {
                            input.remove();
                            nameSpan.style.display = originalDisplay;
                            this.itemToRename = null;
                        }
                    } catch (error) {
                        // 如果重命名失败，保持输入框
                        input.focus();
                    }
                };
                
                input.onblur = () => {
                    // 给一个小延时，以便在点击Enter时不会触发blur事件
                    setTimeout(finishRename, 100);
                };
                input.onkeydown = (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();  // 阻止默认的Enter行为
                        finishRename();
                    } else if (e.key === 'Escape') {
                        input.remove();
                        nameSpan.style.display = originalDisplay;
                        this.itemToRename = null;
                    }
                };
            });
        },
        
        async renameItem(item, newName) {
            try {
                let response;
                if ('folder_id' in item) { // 是文档
                    if (!newName.endsWith('.md') && !newName.endsWith('.rst')) {
                        alert('文档名称必须以.md或.rst结尾');
                        return;
                    }
                    response = await fetch(`/api/documents/${item.path}/rename`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: newName })
                    });
                } else { // 是文件夹
                    if (item.id === 'root') {
                        alert('不能重命名未分类文档文件夹');
                        return;
                    }
                    response = await fetch(`/api/folders/${item.id}/rename`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: newName })
                    });
                }
                
                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error || '重命名失败');
                }
                
                const data = await response.json();
                if ('folder_id' in item) {
                    item.name = newName;
                    item.path = data.new_path;
                    item.id = data.new_path;
                    // 如果当前正在编辑这个文档，更新currentDoc
                    if (this.currentDoc && this.currentDoc.id === item.id) {
                        this.currentDoc = item;
                    }
                } else {
                    item.name = newName;
                }
                // 强制更新视图
                this.$forceUpdate();
            } catch (error) {
                console.error('Error renaming item:', error);
                alert(`重命名失败：${error.message}`);
                throw error;  // 重新抛出错误，让调用者知道失败
            }
        },
        startAutoSave() {
            if (this.autoSaveTimer) {
                clearInterval(this.autoSaveTimer);
            }
            this.autoSaveTimer = setInterval(async () => {
                if (this.currentDoc && this.documentContent !== this.lastSavedContent) {
                    try {
                        await this.saveDocument(true);  // true 表示是自动保存
                        this.lastSavedContent = this.documentContent;
                        this.saveStatus = '已保存';
                    } catch (error) {
                        this.saveStatus = '自动保存失败';
                        console.error('Auto save failed:', error);
                    }
                }
            }, 5000);  // 每5秒保存一次
        },
        stopAutoSave() {
            if (this.autoSaveTimer) {
                clearInterval(this.autoSaveTimer);
                this.autoSaveTimer = null;
            }
        },
        async createNewDocumentInFolder(folder) {
            if (folder.id === 'root') {
                // 如果是根文件夹，直接调用原来的创建方法
                this.createNewDocument();
                return;
            }
            
            const name = prompt('请输入文档名称（以.md或.rst结尾）：');
            if (!name) return;
            
            if (!name.endsWith('.md') && !name.endsWith('.rst')) {
                alert('文档名称必须以.md或.rst结尾');
                return;
            }
            
            // 设置文档类型
            this.currentDocType = name.endsWith('.rst') ? 'rst' : 'md';
            
            const newDoc = {
                id: `${folder.id}/${name}`,
                name: name,
                path: name,
                level: 0,
                folder_id: folder.id
            };
            
            try {
                // 创建文档
                const createResponse = await fetch(`/api/documents/${name}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        content: ''
                    })
                });
                
                if (!createResponse.ok) {
                    const errorData = await createResponse.json();
                    throw new Error(errorData.error || '创建文档失败');
                }
                
                // 移动到指定文件夹
                const moveResponse = await fetch(`/api/documents/${name}/move`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        folder_id: folder.id
                    })
                });
                
                if (!moveResponse.ok) {
                    const errorData = await moveResponse.json();
                    throw new Error(errorData.error || '移动文档失败');
                }
                
                // 确保文件夹是展开的
                if (!folder.expanded) {
                    await this.toggleFolder(folder);
                }
                
                // 添加到文档列表并打开
                this.documents.push(newDoc);
                this.currentDoc = newDoc;
                this.documentContent = '';
                this.updatePreview();
                
                // 重新加载文档列表以确保状态正确
                await this.loadDocuments();
            } catch (error) {
                console.error('Error creating document:', error.message);
                alert(`创建文档失败：${error.message}`);
            }
        },
        async deleteFolder(folder) {
            const docsCount = folder.documents ? folder.documents.length : 0;
            const message = docsCount > 0 
                ? `确定要删除文件夹 "${folder.name}" 及其中的 ${docsCount} 个文档吗？此操作不可恢复！`
                : `确定要删除文件夹 "${folder.name}" 吗？`;
            
            if (!confirm(message)) {
                return;
            }
            
            try {
                const response = await fetch(`/api/folders/${folder.id}`, {
                    method: 'DELETE'
                });
                
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || '删除失败');
                }
                
                // 从文件夹列表中移除
                const index = this.folders.findIndex(f => f.id === folder.id);
                if (index !== -1) {
                    this.folders.splice(index, 1);
                }
                
                // 如果当前打开的文档在被删除的文件夹中，关闭它
                if (this.currentDoc && this.currentDoc.folder_id === folder.id) {
                    this.currentDoc = null;
                    this.documentContent = '';
                    this.renderedContent = '';
                }
                
                // 重新加载文档列表以确保状态正确
                await this.loadDocuments();
            } catch (error) {
                console.error('Error deleting folder:', error);
                alert(`删除文件夹失败：${error.message}`);
            }
        },
        initializeScrollSync() {
            // 移除旧的事件监听器
            const editor = document.querySelector('textarea');
            const preview = document.querySelector('.preview');
            
            if (editor._scrollHandler) {
                editor.removeEventListener('scroll', editor._scrollHandler);
            }
            if (preview._scrollHandler) {
                preview.removeEventListener('scroll', preview._scrollHandler);
            }
            
            // 创建新的事件处理函数
            editor._scrollHandler = () => {
                if (this.scrolling) return;
                this.scrolling = true;
                
                const percentage = editor.scrollTop / (editor.scrollHeight - editor.clientHeight);
                preview.scrollTop = percentage * (preview.scrollHeight - preview.clientHeight);
                
                setTimeout(() => {
                    this.scrolling = false;
                }, 50);
            };
            
            preview._scrollHandler = () => {
                if (this.scrolling) return;
                this.scrolling = true;
                
                const percentage = preview.scrollTop / (preview.scrollHeight - preview.clientHeight);
                editor.scrollTop = percentage * (editor.scrollHeight - editor.clientHeight);
                
                setTimeout(() => {
                    this.scrolling = false;
                }, 50);
            };
            
            // 添加新的事件监听器
            editor.addEventListener('scroll', editor._scrollHandler);
            preview.addEventListener('scroll', preview._scrollHandler);
        },
        showMoveDialog(doc) {
            if (!doc || !doc.path) {
                console.error('Invalid document to move');
                return;
            }
            this.docToMove = doc;
            this.showMoveToFolder = true;
        }
    }
}); 