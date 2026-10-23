// "?new=1" on a page's link opens its "new" form straight away (the office's "+ New" menu uses it).
import { useEffect } from 'react';
import { useSearchParams } from 'react-router';

export function useNewParam(open: () => void) {
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    if (!params.get('new')) return;
    open();
    const next = new URLSearchParams(params);
    next.delete('new');
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);
}
