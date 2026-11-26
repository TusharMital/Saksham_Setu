import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import AllSchemes from "./pages/AllSchemes.jsx";
import ApplyPath from "./pages/ApplyPath.jsx";
import Calculator from "./pages/Calculator.jsx";
import Form from "./pages/Form.jsx";
import Landing from "./pages/Landing.jsx";
import BranchLocator from "./pages/BranchLocator.jsx";
import Results from "./pages/Results.jsx";
import SchemeDetail from "./pages/SchemeDetail.jsx";

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/schemes" element={<AllSchemes />} />
        <Route path="/form" element={<Form />} />
        <Route path="/results" element={<Results />} />
        <Route path="/scheme/:code" element={<SchemeDetail />} />
        <Route path="/apply" element={<ApplyPath />} />
        <Route path="/locator" element={<BranchLocator />} />
        <Route path="/calculator" element={<Calculator />} />
        <Route path="/documents" element={<Navigate to="/results" replace />} />
      </Routes>
    </Layout>
  );
}
