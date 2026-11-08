import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Printer } from 'lucide-react';
import { api } from '../lib/api';
import { ResumeView } from '../components/Markdown';

/** Clean single-column page for "Save as PDF" from the browser print dialog. */
export function PrintResume() {
  const { file = '' } = useParams();
  const [md, setMd] = useState<string>();

  useEffect(() => {
    api.resume(file).then((r) => {
      setMd(r.content);
      document.title = file.replace(/\.md$/, '');
    });
  }, [file]);

  return (
    <div className="min-h-full bg-slate-100 py-8 print:bg-white print:py-0">
      <div className="print-hide mx-auto mb-4 flex max-w-[816px] items-center justify-between px-2">
        <span className="font-mono text-xs text-slate-500">{file}</span>
        <button onClick={() => window.print()} className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
          <Printer className="size-4" /> Save as PDF
        </button>
      </div>
      <div className="mx-auto max-w-[816px] bg-white px-14 py-12 shadow-lg print:max-w-none print:p-0 print:shadow-none">
        {md != null && <ResumeView markdown={md} />}
      </div>
    </div>
  );
}
