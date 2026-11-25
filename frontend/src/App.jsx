import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import ApplyPath from "./pages/ApplyPath.jsx";
import Calculator from "./pages/Calculator.jsx";
import Documents from "./pages/Documents.jsx";
import Form from "./pages/Form.jsx";
import Landing from "./pages/Landing.jsx";
import Locator from "./pages/Locator.jsx";
import Results from "./pages/Results.jsx";
import SchemeDetail from "./pages/SchemeDetail.jsx";
import Tracker from "./pages/Tracker.jsx";

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/form" element={<Form />} />
        <Route path="/results" element={<Results />} />
        <Route path="/scheme/:code" element={<SchemeDetail />} />
        <Route path="/apply" element={<ApplyPath />} />
        <Route path="/locator" element={<Locator />} />
        <Route path="/calculator" element={<Calculator />} />
        <Route path="/documents" element={<Documents />} />
        <Route path="/track" element={<Tracker />} />
      </Routes>
    </Layout>
  );
}
