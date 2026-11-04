import { PageTitle } from "../components/PageTitle/PageTitle.js";
import { Empty } from "../components/Empty/Empty.js";

export function ForbiddenPage(): JSX.Element {
  return (
    <article>
      <PageTitle>Forbidden</PageTitle>
      <Empty>You don't have permission to view this page.</Empty>
    </article>
  );
}
