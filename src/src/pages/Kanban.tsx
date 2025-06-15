import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function Kanban() {
  const [tasks, setTasks] = useState<any[]>([]);

  useEffect(() => {
    async function fetchTasks() {
      const { data, error } = await supabase.from("tasks").select("*");
      if (error) {
        console.error("Ошибка загрузки задач:", error.message);
      } else {
        setTasks(data || []);
      }
    }
    fetchTasks();
  }, []);

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">Канбан-доска</h1>
      {tasks.length === 0 ? (
        <p>Задач нет</p>
      ) : (
        <ul className="space-y-2">
          {tasks.map((task) => (
            <li key={task.id} className="p-2 bg-gray-100 rounded">
              <strong>{task.title}</strong><br />
              <span className="text-sm text-gray-600">{task.description}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
