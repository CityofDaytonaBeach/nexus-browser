import { ExampleDomainthisDomainIsCardOrSection } from './components/ExampleDomainthisDomainIsCardOrSection';
import { ExampleDomainContent } from './components/ExampleDomainContent';
import { ThisDomainIsForContent } from './components/ThisDomainIsForContent';
import { LearnMoreContent } from './components/LearnMoreContent';
import { LearnMoreLink } from './components/LearnMoreLink';

export default function Page() {
  return (
    <main className="min-h-screen bg-white font-captured text-slate-950">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 md:p-8">
        <ExampleDomainthisDomainIsCardOrSection />
        <ExampleDomainContent />
        <ThisDomainIsForContent />
        <LearnMoreContent />
        <LearnMoreLink />
      </div>
    </main>
  );
}
