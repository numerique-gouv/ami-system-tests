
iOS supporte les caractères unicode, pas l'outil adb d'android.

https://blog.droidchef.dev/how-to-input-unicode-characters-in-maestro-android-tests-a-complete-workaround-guide/

Le problème existe depuis toujours, et n'est pas solvable simplement, adb qui fait la saisie ne supporte pas le non-ascii: https://github.com/mobile-dev-inc/maestro/issues/146

Et du côté de Google, on n'est pas prêt à voir un correctif :
https://issuetracker.google.com/issues/207386157?pli=1

