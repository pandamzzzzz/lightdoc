# 在线文档管理系统

一个基于 Flask 和 Vue.js 的在线文档管理系统，支持 Markdown 和 reStructuredText 格式的文档编辑、预览和管理。

## 功能特点

- 支持 Markdown 和 reStructuredText (RST) 格式文档
- 实时预览和自动保存
- 文件夹管理和文档分类
- 拖拽排序和移动文档
- 文档同步滚动预览
- 支持文件夹和文档的重命名
- 简洁美观的界面设计

## 技术栈

### 后端
- Python 3.8+
- Flask
- docutils (RST 支持)
- Pygments (代码高亮)

### 前端
- Vue.js 2.6
- Marked.js (Markdown 解析)
- GitHub Markdown CSS

## 安装和运行

1. 克隆项目 

```bash
git clone https://github.com/pandamzzzzz/lightdoc.git
cd lightdoc
```

2. 安装依赖

```bash
pip install -r requirements.txt
```

3. 运行项目

```bash
python app.py
```

4. 访问项目

```bash
http://localhost:5000
```

## 项目结构

```bash
doc_system/
├── app.py                 # Flask 后端应用
├── requirements.txt       # Python 依赖
├── LICENSE               # MIT 许可证
├── README.md             # 项目说明文档
├── static/               # 静态文件
│   ├── css/
│   │   └── style.css    # 样式文件
│   └── js/
│       └── main.js      # Vue.js 前端逻辑
├── templates/
│   └── index.html       # 主页面模板
└── data/                # 数据存储
    ├── documents/       # 文档存储
    │   ├── markdown_demo.md  # Markdown 示例文档
    │   └── rst_demo.rst     # RST 示例文档
    ├── folders.json     # 文件夹数据
    └── docs_meta.json   # 文档元数据
```


## 使用说明

### 文档管理
- 点击"新建文档"创建 .md 或 .rst 格式的文档
- 在文件夹中点击"+"可以直接在该文件夹下创建文档
- 拖拽文档可以改变顺序或移动到其他文件夹
- 双击文档或文件夹名称可以重命名

### 文档编辑
- 左侧为编辑区，右侧为实时预览
- 编辑时自动保存（每5秒）
- 可以通过滚动同步预览内容
- 支持 Markdown 和 RST 语法

### 文件夹管理
- 点击"新建文件夹"创建文件夹
- 点击文件夹前的箭头可以展开/折叠
- 可以通过拖拽将文档移动到不同文件夹

## 开发计划

- [ ] 支持更多文档格式
- [ ] 添加用户认证系统
- [ ] 添加文档搜索功能
- [ ] 支持文档历史版本
- [ ] 添加文档分享功能

## 贡献指南

欢迎提交 Issue 和 Pull Request 来帮助改进项目。

## 许可证

本项目采用 MIT 许可证。详见 [LICENSE](LICENSE) 文件。
