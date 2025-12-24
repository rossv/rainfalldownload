import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';

export interface StatusTask {
    id: string;
    message: string;
    status: 'pending' | 'success' | 'error';
}

interface StatusCenterProps {
    tasks: StatusTask[];
}

export function StatusCenter({ tasks }: StatusCenterProps) {
    if (tasks.length === 0) return null;

    return (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
            {tasks.map(task => (
                <div
                    key={task.id}
                    className={cn(
                        "pointer-events-auto flex items-center gap-3 p-3 rounded-lg shadow-lg border border-border bg-card animate-in slide-in-from-right-full duration-300",
                        task.status === 'error' && "border-red-200 bg-red-50 dark:bg-red-950/20"
                    )}
                >
                    {task.status === 'pending' && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                    {task.status === 'success' && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                    {task.status === 'error' && <AlertCircle className="h-4 w-4 text-red-500" />}

                    <span className="text-sm font-medium">{task.message}</span>
                </div>
            ))}
        </div>
    );
}
