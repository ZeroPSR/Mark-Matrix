/**
 * A course together with the semester it belongs to, and that semester's
 * place in the batch → program → semester hierarchy.
 *
 * This is the contract of both course-list endpoints: `/api/faculty/courses`
 * and `/api/admin/courses/hierarchy`. The hierarchy ids are what the marks,
 * attendance, analytics and lifecycle URLs are built from, so a course list
 * that omits them leaves its caller unable to address anything under a
 * course.
 *
 * It lives in the shared package so the API's response and the pages'
 * expectations are the same declaration. When each side declared its own
 * interface, the admin course list returned a flat row while the pages
 * expected this shape, and every test passed because the mock was written
 * from the expectation.
 */
export interface CourseWithSemester {
  id: string;
  code: string;
  title: string;
  credits: number;
  semester: {
    id: string;
    number: number;
    programId: string;
    batchId: string;
  };
}

/** The response body of a course-list endpoint. */
export interface CourseListResponse {
  data: CourseWithSemester[];
}
