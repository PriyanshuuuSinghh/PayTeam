import { Outlet } from "react-router-dom";
import GlassWorkspace from "../components/workspace/GlassWorkspace";

export function UserLayout() {
  return <GlassWorkspace><Outlet/></GlassWorkspace>;
}

export default UserLayout;
