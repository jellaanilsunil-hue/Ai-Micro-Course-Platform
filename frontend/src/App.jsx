import { Navigate, Route, Routes } from "react-router-dom";
import { homePath, useAuth } from "./auth.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import Feedback from "./pages/Feedback.jsx";
import Dashboard from "./pages/student/Dashboard.jsx";
import CoursePage from "./pages/student/CoursePage.jsx";
import Chapters from "./pages/student/Chapters.jsx";
import TestPage from "./pages/student/TestPage.jsx";
import Progress from "./pages/student/Progress.jsx";
import Certificate from "./pages/student/Certificate.jsx";
import Portal from "./pages/professor/Portal.jsx";
import ManageCourse from "./pages/professor/ManageCourse.jsx";
import Analytics from "./pages/professor/Analytics.jsx";

function Protected({ role, children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/" replace />;
  if (role && user.role !== role) return <Navigate to={homePath(user)} replace />;
  return children;
}

export default function App() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/" element={user ? <Navigate to={homePath(user)} replace /> : <Login />} />
      <Route path="/register" element={user ? <Navigate to={homePath(user)} replace /> : <Register />} />

      <Route path="/student" element={<Protected role="student"><Dashboard /></Protected>} />
      <Route path="/student/courses/:courseId" element={<Protected role="student"><CoursePage /></Protected>} />
      <Route path="/student/courses/:courseId/certificate" element={<Protected role="student"><Certificate /></Protected>} />
      <Route path="/student/levels/:levelId/chapters" element={<Protected role="student"><Chapters /></Protected>} />
      <Route path="/student/levels/:levelId/test" element={<Protected role="student"><TestPage /></Protected>} />
      <Route path="/student/progress" element={<Protected role="student"><Progress /></Protected>} />

      <Route path="/professor" element={<Protected role="professor"><Portal /></Protected>} />
      <Route path="/professor/courses/:courseId" element={<Protected role="professor"><ManageCourse /></Protected>} />
      <Route path="/professor/analytics" element={<Protected role="professor"><Analytics /></Protected>} />

      <Route path="/feedback" element={<Protected><Feedback /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
