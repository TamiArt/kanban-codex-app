import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Kanban from "./pages/Kanban";
import ContentPlan from "./pages/ContentPlan";
import Settings from "./pages/Settings";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Kanban />} />
        <Route path="/publications" element={<ContentPlan />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}
