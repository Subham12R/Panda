import { useState } from "react";
import { CheckCircle2, Circle, CircleAlert, CircleDotDashed, CircleX } from "lucide-react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";

interface Subtask {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  tools?: string[];
}

export interface PlanTask {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  level: number;
  dependencies: string[];
  subtasks: Subtask[];
}

interface AgentPlanProps {
  tasks: PlanTask[];
}

function StatusIcon({ status, size = 'md' }: { status: string; size?: 'sm' | 'md' }) {
  const cls = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';
  if (status === 'completed') return <CheckCircle2 className={`${cls} text-green-500`} />;
  if (status === 'in-progress') return <CircleDotDashed className={`${cls} text-blue-400`} />;
  if (status === 'need-help') return <CircleAlert className={`${cls} text-yellow-400`} />;
  if (status === 'failed') return <CircleX className={`${cls} text-red-400`} />;
  return <Circle className={`${cls} text-zinc-600`} />;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    completed: 'bg-green-950/60 text-green-400',
    'in-progress': 'bg-blue-950/60 text-blue-400',
    'need-help': 'bg-yellow-950/60 text-yellow-400',
    failed: 'bg-red-950/60 text-red-400',
    pending: 'bg-zinc-800/60 text-zinc-500',
  };
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${map[status] ?? map.pending}`}>
      {status}
    </span>
  );
}

export default function AgentPlan({ tasks }: AgentPlanProps) {
  const [expandedTasks, setExpandedTasks] = useState<string[]>(tasks.length > 0 ? [tasks[0].id] : []);
  const [expandedSubtasks, setExpandedSubtasks] = useState<Record<string, boolean>>({});

  const toggle = (id: string) =>
    setExpandedTasks((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const toggleSub = (key: string) =>
    setExpandedSubtasks((p) => ({ ...p, [key]: !p[key] }));

  return (
    <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/40 overflow-hidden text-sm">
      <LayoutGroup>
        <div className="p-3">
          <ul className="space-y-0.5">
            {tasks.map((task, idx) => {
              const expanded = expandedTasks.includes(task.id);
              return (
                <motion.li key={task.id} className={idx !== 0 ? 'pt-1.5' : ''} layout>
                  <div className="group flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-zinc-800/30 transition-colors cursor-pointer" onClick={() => toggle(task.id)}>
                    <StatusIcon status={task.status} />
                    <span className={`flex-1 truncate text-xs font-medium ${task.status === 'completed' ? 'text-zinc-600 line-through' : 'text-zinc-200'}`}>
                      {task.title}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {task.dependencies.map((dep, i) => (
                        <span key={i} className="text-[10px] bg-zinc-800 text-zinc-500 rounded px-1">{dep}</span>
                      ))}
                      <StatusBadge status={task.status} />
                    </div>
                  </div>

                  <AnimatePresence>
                    {expanded && task.subtasks.length > 0 && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: [0.2, 0.65, 0.3, 0.9] }}
                        className="overflow-hidden relative"
                      >
                        <div className="absolute top-0 bottom-0 left-[18px] border-l border-dashed border-zinc-700/50" />
                        <ul className="ml-3 mt-0.5 mb-1 space-y-0.5">
                          {task.subtasks.map((sub) => {
                            const subKey = `${task.id}-${sub.id}`;
                            const subExpanded = expandedSubtasks[subKey];
                            return (
                              <motion.li key={sub.id} layout className="pl-5">
                                <div className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-zinc-800/20 transition-colors cursor-pointer" onClick={() => toggleSub(subKey)}>
                                  <StatusIcon status={sub.status} size="sm" />
                                  <span className={`flex-1 text-xs ${sub.status === 'completed' ? 'text-zinc-600 line-through' : 'text-zinc-400'}`}>{sub.title}</span>
                                </div>
                                <AnimatePresence>
                                  {subExpanded && (
                                    <motion.div
                                      initial={{ height: 0, opacity: 0 }}
                                      animate={{ height: 'auto', opacity: 1 }}
                                      exit={{ height: 0, opacity: 0 }}
                                      transition={{ duration: 0.15 }}
                                      className="overflow-hidden pl-6 pb-1"
                                    >
                                      <p className="text-[11px] text-zinc-600 py-0.5">{sub.description}</p>
                                      {sub.tools && sub.tools.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-1">
                                          {sub.tools.map((t, i) => (
                                            <span key={i} className="text-[10px] bg-zinc-800/80 text-zinc-500 rounded px-1.5 py-0.5">{t}</span>
                                          ))}
                                        </div>
                                      )}
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </motion.li>
                            );
                          })}
                        </ul>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.li>
              );
            })}
          </ul>
        </div>
      </LayoutGroup>
    </div>
  );
}
