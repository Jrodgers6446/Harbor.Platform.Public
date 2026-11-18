import { DemoApp } from '@/components/DemoApp';

export const metadata = { title: 'Harbor demo' };

/** Public, read-only tour of Harbor with made-up data. ?embed=1 is the version inside the front page. */
export default function Demo({ searchParams }: { searchParams: { embed?: string } }) {
  return <DemoApp embed={searchParams.embed === '1'} />;
}
