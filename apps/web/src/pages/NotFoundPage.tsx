import { PageTitle } from "../components/PageTitle/PageTitle.js";
import { Empty } from "../components/Empty/Empty.js";

export function NotFoundPage(): JSX.Element {
  return (
    <article>
      <PageTitle>Not found</PageTitle>
      <Empty>The page you were looking for doesn't exist.</Empty>
    </article>
  );
}
