-- Profiles Table
CREATE TABLE public."Profiles" (
    id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    username text UNIQUE NOT NULL,
    has_onboarded boolean DEFAULT false,
    weekly_goal_minutes integer DEFAULT 120,
    created_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id)
);

-- Friendships Table
CREATE TYPE friendship_status AS ENUM ('PENDING', 'ACCEPTED');
CREATE TABLE public."Friendships" (
    user_id_1 uuid NOT NULL REFERENCES public."Profiles"(id) ON DELETE CASCADE,
    user_id_2 uuid NOT NULL REFERENCES public."Profiles"(id) ON DELETE CASCADE,
    status friendship_status DEFAULT 'PENDING',
    requested_by uuid NOT NULL REFERENCES public."Profiles"(id) ON DELETE CASCADE, -- Who initiated the request
    created_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (user_id_1, user_id_2),
    CHECK (user_id_1 < user_id_2) -- Ensure unique pairs regardless of order
);

CREATE INDEX idx_friendships_users ON public."Friendships" (user_id_1, user_id_2);

-- Sessions Table
CREATE TYPE timer_type AS ENUM ('POMODORO', 'STOPWATCH');
CREATE TABLE public."Sessions" (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES public."Profiles"(id) ON DELETE CASCADE,
    topic text,
    timer_type timer_type NOT NULL,
    duration_seconds integer NOT NULL,
    timestamp timestamp with time zone DEFAULT now()
);

CREATE INDEX idx_sessions_user_time ON public."Sessions" (user_id, timestamp);

-- Function for checking friendship (SECURITY DEFINER for elevated privileges)
CREATE OR REPLACE FUNCTION public.is_friend(target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public."Friendships"
        WHERE (user_id_1 = auth.uid() AND user_id_2 = target_user_id AND status = 'ACCEPTED')
           OR (user_id_1 = target_user_id AND user_id_2 = auth.uid() AND status = 'ACCEPTED')
    );
END;
$$;

-- Enable RLS logic
ALTER TABLE public."Profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Friendships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Sessions" ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
CREATE POLICY "Profiles are selectable by public" ON public."Profiles" FOR SELECT USING (true);
CREATE POLICY "Users can insert their own profile" ON public."Profiles" FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public."Profiles" FOR UPDATE USING (auth.uid() = id);

-- Friendships Policies
CREATE POLICY "Users can see friendships they are part of" ON public."Friendships" FOR SELECT USING (auth.uid() = user_id_1 OR auth.uid() = user_id_2);
CREATE POLICY "Users can insert friendships they are part of" ON public."Friendships" FOR INSERT WITH CHECK (auth.uid() = user_id_1 OR auth.uid() = user_id_2);
CREATE POLICY "Users can update friendships they are part of" ON public."Friendships" FOR UPDATE USING (auth.uid() = user_id_1 OR auth.uid() = user_id_2);

-- Sessions Policies
CREATE POLICY "Users can insert their own sessions" ON public."Sessions" FOR INSERT WITH CHECK (auth.uid() = user_id);
-- Selecting sessions: user can see their own, OR sessions of users they are accepted friends with
CREATE POLICY "Users can view own or friends sessions" ON public."Sessions" FOR SELECT USING (
    user_id = auth.uid() OR public.is_friend(user_id)
);
