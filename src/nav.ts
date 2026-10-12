let routed = 0;

export function noteNavigation() {
  routed++;
}

/** Go back inside the app; if the app was opened directly on a sub-page, go to the list. */
export function goBack() {
  if (routed > 0) history.back();
  else location.replace('#/');
}
