import * as React from "react";
import { Input } from "./input";
function DatePicker(props: Omit<React.ComponentProps<typeof Input>, "type">) { return <Input type="date" {...props} />; }
export { DatePicker };
