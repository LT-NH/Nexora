import React from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';

interface Props {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

export const RichTextEditor: React.FC<Props> = ({ content, onChange, placeholder }) => {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Image,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: placeholder || '输入内容...' }),
    ],
    content: content || '',
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  if (!editor) return null;

  return (
    <div className="border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
      <div className="flex flex-wrap gap-1 p-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <button onClick={() => editor.chain().focus().toggleBold().run()} className={`p-1.5 rounded text-sm ${editor.isActive('bold') ? 'bg-gray-200 dark:bg-gray-600' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}>B</button>
        <button onClick={() => editor.chain().focus().toggleItalic().run()} className={`p-1.5 rounded text-sm italic ${editor.isActive('italic') ? 'bg-gray-200 dark:bg-gray-600' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}>I</button>
        <button onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={`p-1.5 rounded text-sm font-bold ${editor.isActive('heading') ? 'bg-gray-200 dark:bg-gray-600' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}>H2</button>
        <button onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} className={`p-1.5 rounded text-sm font-bold ${editor.isActive('heading', { level: 3 }) ? 'bg-gray-200 dark:bg-gray-600' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}>H3</button>
        <button onClick={() => editor.chain().focus().toggleBulletList().run()} className={`p-1.5 rounded text-sm ${editor.isActive('bulletList') ? 'bg-gray-200 dark:bg-gray-600' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}>List</button>
        <button onClick={() => editor.chain().focus().toggleOrderedList().run()} className={`p-1.5 rounded text-sm ${editor.isActive('orderedList') ? 'bg-gray-200 dark:bg-gray-600' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}>1.</button>
        <div className="w-px bg-gray-300 dark:bg-gray-600 mx-1" />
        <button onClick={() => { const url = prompt('图片URL'); if (url) editor.chain().focus().setImage({ src: url }).run(); }} className="p-1.5 rounded text-sm hover:bg-gray-100 dark:hover:bg-gray-700">IMG</button>
        <button onClick={() => { const url = prompt('链接URL'); if (url) editor.chain().focus().setLink({ href: url }).run(); }} className="p-1.5 rounded text-sm hover:bg-gray-100 dark:hover:bg-gray-700">LINK</button>
      </div>
      <EditorContent editor={editor} className="prose dark:prose-invert max-w-none p-3 min-h-[200px] focus:outline-none" />
    </div>
  );
};
