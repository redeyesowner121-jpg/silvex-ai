DROP POLICY IF EXISTS "notices public" ON public.notifications;
CREATE POLICY "notices signed in" ON public.notifications FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
REVOKE SELECT ON public.notifications FROM anon;