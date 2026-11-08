import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { rehypeKeywords, type Term } from '../lib/highlight';
import { cx } from '../lib/format';

export function Md({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cx('md', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: (p) => <a {...p} target="_blank" rel="noreferrer" /> }}>
        {children}
      </ReactMarkdown>
    </div>
  );
}

/** Resume rendered as a document page, optionally with keyword highlights. */
export function ResumeView({ markdown, terms, className }: { markdown: string; terms?: Term[]; className?: string }) {
  const plugins = useMemo(() => (terms?.length ? [rehypeKeywords(terms)] : []), [terms]);
  return (
    <div className={cx('resume', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={plugins}>
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
