import { Skeleton } from '@/components/ui/skeleton';

export default function ThreadLoading() {
  return (
    <div className="flex h-screen flex-col">
      <div className="flex-1 p-6">
        <div className="flex flex-col gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton
              key={i}
              className={`h-12 rounded-lg ${i % 2 === 0 ? 'w-3/4' : 'ml-auto w-1/2'}`}
            />
          ))}
        </div>
      </div>
      <div className="border-t p-4">
        <Skeleton className="h-12 w-full rounded-lg" />
      </div>
    </div>
  );
}
