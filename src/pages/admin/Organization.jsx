import { Card } from "../../components/ui/primitives";

export default function Organization() {
  return (
    <Card className="p-6">
      <p className="text-[13px] text-[var(--color-text-muted)]">
        Organization - build this out against the matching ERPNext doctype(s) or your custom my_hrms app API.
      </p>
    </Card>
  );
}
