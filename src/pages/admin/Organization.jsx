import { DoctypeCrud } from "../hr/DoctypeView";
import { findSetupItem } from "../../lib/hrSetupConfig";

/**
 * Company setup lives here (Administrator only). Each HR user is then tied to
 * one of these companies from the HR Users page.
 */
export default function Organization() {
  const company = findSetupItem("company");
  return <DoctypeCrud item={{ ...company, section: "Organization" }} />;
}