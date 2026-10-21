CREATE SCHEMA hoa;
REVOKE ALL ON SCHEMA hoa FROM PUBLIC;
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='hoa_runtime') THEN
    CREATE ROLE hoa_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA hoa TO hoa_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA hoa REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE TABLE hoa.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), subject text NOT NULL UNIQUE,
  email text NOT NULL UNIQUE, email_verified boolean NOT NULL DEFAULT false,
  platform_admin boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE hoa.sessions (
  token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES hoa.users(id),
  mfa boolean NOT NULL, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON hoa.sessions(expires_at);
CREATE TABLE hoa.oauth_attempts (state_hash text PRIMARY KEY, encrypted_payload text NOT NULL, expires_at timestamptz NOT NULL);
CREATE TABLE hoa.rate_limits (key_hash text PRIMARY KEY, window_start timestamptz NOT NULL, attempts integer NOT NULL CHECK(attempts>0));

CREATE TABLE hoa.organizations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL);
CREATE TABLE hoa.organization_memberships (
  organization_id uuid NOT NULL REFERENCES hoa.organizations(id), user_id uuid NOT NULL REFERENCES hoa.users(id),
  role text NOT NULL CHECK(role='organization_admin'), revoked_at timestamptz,
  PRIMARY KEY (organization_id,user_id)
);
CREATE TABLE hoa.community_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), address_key text NOT NULL UNIQUE,
  near_key text NOT NULL, canonical_address jsonb NOT NULL
);
CREATE INDEX ON hoa.community_locations(near_key);
CREATE TABLE hoa.registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), applicant_id uuid NOT NULL REFERENCES hoa.users(id),
  location_id uuid NOT NULL REFERENCES hoa.community_locations(id),
  kind text NOT NULL CHECK(kind IN ('new','access','shared_association','ownership_dispute')),
  status text NOT NULL CHECK(status IN ('pending_review','claim_review','approved','rejected','expired')),
  payload jsonb NOT NULL, near_match boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL DEFAULT now()+interval '14 days',
  reviewed_by uuid REFERENCES hoa.users(id), review_reason text, evidence_reference text,
  created_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz
);
CREATE UNIQUE INDEX one_pending_reservation ON hoa.registrations(location_id) WHERE status='pending_review';
CREATE INDEX ON hoa.registrations(applicant_id,created_at DESC);
CREATE INDEX ON hoa.registrations(status,expires_at);
CREATE TABLE hoa.address_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), registration_id uuid NOT NULL UNIQUE REFERENCES hoa.registrations(id),
  location_id uuid NOT NULL REFERENCES hoa.community_locations(id), approved_by uuid NOT NULL REFERENCES hoa.users(id),
  reason text NOT NULL CHECK(length(reason)>=20), evidence_reference text NOT NULL CHECK(length(evidence_reference)>=10),
  approved_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,location_id)
);
CREATE TABLE hoa.communities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), location_id uuid NOT NULL REFERENCES hoa.community_locations(id),
  address_exception_id uuid, legal_name text NOT NULL, display_name text NOT NULL,
  slug text NOT NULL UNIQUE CHECK(slug ~ '^[a-z][a-z0-9-]{2,47}$' AND right(slug,1)<>'-'
    AND slug NOT IN ('www','app','api','admin','auth','login','signup','register','support','mail','status','billing','assets','static','cdn','portfolio')),
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended','archived')),
  timezone text NOT NULL DEFAULT 'America/New_York', created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(address_exception_id,location_id) REFERENCES hoa.address_exceptions(id,location_id), UNIQUE(id,location_id)
);
CREATE UNIQUE INDEX one_primary_association_per_location ON hoa.communities(location_id) WHERE address_exception_id IS NULL;
CREATE TABLE hoa.memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), community_id uuid NOT NULL REFERENCES hoa.communities(id),
  user_id uuid NOT NULL REFERENCES hoa.users(id),
  role text NOT NULL CHECK(role IN ('community_admin','board_member','treasurer','moderator','homeowner','resident')),
  starts_at timestamptz NOT NULL DEFAULT now(), ends_at timestamptz, revoked_at timestamptz,
  UNIQUE(community_id,user_id), UNIQUE(community_id,id), CHECK(ends_at IS NULL OR ends_at>starts_at)
);
CREATE INDEX ON hoa.memberships(user_id) WHERE revoked_at IS NULL;
CREATE TABLE hoa.management_assignments (
  organization_id uuid NOT NULL REFERENCES hoa.organizations(id), community_id uuid NOT NULL REFERENCES hoa.communities(id),
  starts_at timestamptz NOT NULL DEFAULT now(), ends_at timestamptz, allow_portfolio boolean NOT NULL DEFAULT false,
  PRIMARY KEY(organization_id,community_id,starts_at), CHECK(ends_at IS NULL OR ends_at>starts_at)
);
CREATE TABLE hoa.role_permissions (role text NOT NULL, permission text NOT NULL, PRIMARY KEY(role,permission));
INSERT INTO hoa.role_permissions VALUES
  ('community_admin','community.read'),('community_admin','members.manage'),('community_admin','governance.read'),('community_admin','governance.publish'),('community_admin','events.organize'),('community_admin','discussions.moderate'),
  ('board_member','community.read'),('board_member','governance.read'),('board_member','events.organize'),
  ('treasurer','community.read'),('treasurer','governance.read'),('treasurer','finance.manage'),
  ('moderator','community.read'),('moderator','discussions.moderate'),
  ('homeowner','community.read'),('resident','community.read');
CREATE TABLE hoa.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), community_id uuid REFERENCES hoa.communities(id),
  actor_id uuid NOT NULL REFERENCES hoa.users(id), action text NOT NULL, resource_id uuid NOT NULL,
  details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON hoa.audit_events(community_id,created_at DESC);

CREATE FUNCTION hoa.actor_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.user_id',true),'')::uuid $$;
CREATE FUNCTION hoa.tenant_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.community_id',true),'')::uuid $$;
CREATE FUNCTION hoa.has_mfa() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT coalesce(current_setting('app.mfa',true),'false')='true' $$;
CREATE FUNCTION hoa.is_platform_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,hoa AS $$
  SELECT hoa.has_mfa() AND EXISTS(SELECT 1 FROM hoa.users WHERE id=hoa.actor_id() AND platform_admin AND email_verified)
$$;
CREATE FUNCTION hoa.has_permission(cid uuid, perm text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,hoa AS $$
  SELECT cid=hoa.tenant_id() AND EXISTS(
    SELECT 1 FROM hoa.memberships m JOIN hoa.role_permissions p USING(role) JOIN hoa.communities c ON c.id=m.community_id
    WHERE m.community_id=cid AND m.user_id=hoa.actor_id() AND p.permission=perm
      AND m.revoked_at IS NULL AND m.starts_at<=now() AND (m.ends_at IS NULL OR m.ends_at>now())
      AND c.status='active' AND (m.role IN ('homeowner','resident') OR hoa.has_mfa()))
$$;

-- Authentication bootstrap exposes only capability-token lookups and narrow writes.
-- Tenant services cannot read authentication tables directly.
CREATE FUNCTION hoa.session_principal(h text) RETURNS TABLE(id uuid,email text,mfa boolean,platform_admin boolean) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,hoa AS $$
  SELECT u.id,u.email,s.mfa,u.platform_admin FROM hoa.sessions s JOIN hoa.users u ON u.id=s.user_id
    WHERE s.token_hash=h AND s.expires_at>now() AND u.email_verified
$$;
CREATE FUNCTION hoa.issue_session(s text,e text,h text,m boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,hoa AS $$
DECLARE uid uuid;
BEGIN
  INSERT INTO hoa.users(subject,email,email_verified) VALUES(s,e,true)
    ON CONFLICT(subject) DO UPDATE SET email=excluded.email,email_verified=true RETURNING id INTO uid;
  INSERT INTO hoa.sessions(token_hash,user_id,mfa,expires_at) VALUES(h,uid,m,now()+interval '30 minutes');
  DELETE FROM hoa.sessions WHERE expires_at<now();
END $$;
CREATE FUNCTION hoa.revoke_session(h text) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,hoa AS $$ DELETE FROM hoa.sessions WHERE token_hash=h $$;
CREATE FUNCTION hoa.store_oauth(h text,p text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,hoa AS $$
BEGIN
  DELETE FROM hoa.oauth_attempts WHERE expires_at<now();
  INSERT INTO hoa.oauth_attempts VALUES(h,p,now()+interval '10 minutes');
END $$;
CREATE FUNCTION hoa.consume_oauth(h text) RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,hoa AS $$ DELETE FROM hoa.oauth_attempts WHERE state_hash=h AND expires_at>now() RETURNING encrypted_payload $$;
CREATE FUNCTION hoa.rate_limit(k text,maximum integer) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,hoa AS $$
DECLARE n integer;
BEGIN
  INSERT INTO hoa.rate_limits VALUES(k,date_trunc('minute',now()),1)
  ON CONFLICT(key_hash) DO UPDATE SET window_start=date_trunc('minute',now()),
    attempts=CASE WHEN hoa.rate_limits.window_start=date_trunc('minute',now()) THEN hoa.rate_limits.attempts+1 ELSE 1 END
  RETURNING attempts INTO n;
  DELETE FROM hoa.rate_limits WHERE window_start<now()-interval '1 day';
  RETURN n<=maximum;
END $$;

CREATE FUNCTION hoa.my_communities() RETURNS TABLE(id uuid,display_name text,slug text,role text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,hoa AS $$
  SELECT c.id,c.display_name,c.slug,m.role FROM hoa.memberships m JOIN hoa.communities c ON c.id=m.community_id
  WHERE m.user_id=hoa.actor_id() AND m.revoked_at IS NULL AND m.starts_at<=now() AND (m.ends_at IS NULL OR m.ends_at>now())
    AND c.status='active' AND (m.role IN ('homeowner','resident') OR hoa.has_mfa()) ORDER BY c.display_name
$$;
CREATE FUNCTION hoa.public_community(s text) RETURNS TABLE(id uuid,display_name text,slug text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,hoa AS $$
  SELECT c.id,c.display_name,c.slug FROM hoa.communities c WHERE c.slug=s AND c.status='active'
$$;
CREATE FUNCTION hoa.my_portfolio() RETURNS TABLE(organization_name text,community_id uuid,display_name text,slug text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,hoa AS $$
  SELECT o.name,c.id,c.display_name,c.slug FROM hoa.organization_memberships om JOIN hoa.organizations o ON o.id=om.organization_id
    JOIN hoa.management_assignments a ON a.organization_id=o.id JOIN hoa.communities c ON c.id=a.community_id
  WHERE om.user_id=hoa.actor_id() AND om.revoked_at IS NULL AND hoa.has_mfa() AND a.allow_portfolio
    AND a.starts_at<=now() AND (a.ends_at IS NULL OR a.ends_at>now()) AND c.status='active' ORDER BY c.display_name
$$;

CREATE FUNCTION hoa.submit_registration(p jsonb,k text,n text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,hoa AS $$
DECLARE lid uuid; rid uuid; occupied boolean; kind text:=p->>'kind';
BEGIN
  IF NOT EXISTS(SELECT FROM hoa.users WHERE id=hoa.actor_id() AND email_verified) THEN RAISE EXCEPTION 'Verified identity required' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(k,0));
  INSERT INTO hoa.community_locations(address_key,near_key,canonical_address) VALUES(k,n,p->'normalizedAddress') ON CONFLICT(address_key) DO NOTHING;
  SELECT id INTO lid FROM hoa.community_locations WHERE address_key=k FOR UPDATE;
  UPDATE hoa.registrations SET status='expired' WHERE location_id=lid AND status='pending_review' AND expires_at<=now();
  occupied:=EXISTS(SELECT FROM hoa.communities WHERE location_id=lid) OR EXISTS(SELECT FROM hoa.registrations WHERE location_id=lid AND status='pending_review');
  IF kind='new' AND occupied THEN RAISE EXCEPTION 'Location requires review' USING ERRCODE='23505'; END IF;
  INSERT INTO hoa.registrations(applicant_id,location_id,kind,status,payload,near_match)
  VALUES(hoa.actor_id(),lid,kind,CASE WHEN kind='new' THEN 'pending_review' ELSE 'claim_review' END,p,
    EXISTS(SELECT FROM hoa.community_locations WHERE near_key=n AND id<>lid) OR EXISTS(SELECT FROM hoa.communities WHERE lower(legal_name)=lower(p->>'legalName')))
  RETURNING id INTO rid;
  INSERT INTO hoa.audit_events(actor_id,action,resource_id) VALUES(hoa.actor_id(),'registration.submitted',rid);
  RETURN rid;
END $$;

CREATE FUNCTION hoa.review_registration(rid uuid,decision text,reason text,evidence text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,hoa AS $$
DECLARE r hoa.registrations; cid uuid; exception_id uuid;
BEGIN
  IF NOT hoa.is_platform_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  IF length(trim(reason))<20 OR length(trim(evidence))<10 THEN RAISE EXCEPTION 'Review evidence and reason required' USING ERRCODE='22023'; END IF;
  SELECT * INTO r FROM hoa.registrations WHERE id=rid;
  IF r.id IS NULL OR r.status NOT IN ('pending_review','claim_review') OR r.applicant_id=hoa.actor_id() THEN RAISE EXCEPTION 'Invalid review' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM hoa.community_locations WHERE id=r.location_id FOR UPDATE;
  SELECT * INTO r FROM hoa.registrations WHERE id=rid FOR UPDATE;
  IF r.status NOT IN ('pending_review','claim_review') THEN RAISE EXCEPTION 'Request already reviewed' USING ERRCODE='22023'; END IF;
  IF decision='reject' THEN
    UPDATE hoa.registrations SET status='rejected' WHERE id=rid;
  ELSE
    IF r.expires_at<=now() THEN RAISE EXCEPTION 'Reservation expired; a new submission is required' USING ERRCODE='22023'; END IF;
    IF decision='approve_shared' AND r.kind='shared_association' THEN
      IF NOT EXISTS(SELECT FROM hoa.communities WHERE location_id=r.location_id) THEN RAISE EXCEPTION 'No verified shared location' USING ERRCODE='22023'; END IF;
      INSERT INTO hoa.address_exceptions(registration_id,location_id,approved_by,reason,evidence_reference)
        VALUES(rid,r.location_id,hoa.actor_id(),reason,evidence) RETURNING id INTO exception_id;
    ELSIF decision<>'approve' OR r.kind<>'new' OR EXISTS(SELECT FROM hoa.communities WHERE location_id=r.location_id) THEN
      RAISE EXCEPTION 'An audited shared-address decision is required' USING ERRCODE='22023';
    END IF;
    INSERT INTO hoa.communities(location_id,address_exception_id,legal_name,display_name,slug,timezone)
      VALUES(r.location_id,exception_id,r.payload->>'legalName',r.payload->>'displayName',r.payload->>'slug',r.payload->>'timezone') RETURNING id INTO cid;
    INSERT INTO hoa.memberships(community_id,user_id,role) VALUES(cid,r.applicant_id,'community_admin');
    UPDATE hoa.registrations SET status='approved' WHERE id=rid;
  END IF;
  UPDATE hoa.registrations SET reviewed_by=hoa.actor_id(),review_reason=reason,evidence_reference=evidence,reviewed_at=now() WHERE id=rid;
  INSERT INTO hoa.audit_events(actor_id,action,resource_id,details) VALUES(hoa.actor_id(),'registration.'||decision,rid,jsonb_build_object('communityId',cid,'exceptionId',exception_id));
  RETURN cid;
END $$;

CREATE FUNCTION hoa.record_review_access() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,hoa AS $$
BEGIN
  IF NOT hoa.is_platform_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  INSERT INTO hoa.audit_events(actor_id,action,resource_id) VALUES(hoa.actor_id(),'registration.queue.viewed',hoa.actor_id());
END $$;

CREATE FUNCTION hoa.revoke_membership(mid uuid,reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,hoa AS $$
DECLARE m hoa.memberships;
BEGIN
  IF NOT hoa.has_permission(hoa.tenant_id(),'members.manage') OR length(trim(reason))<10 THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM hoa.communities WHERE id=hoa.tenant_id() FOR UPDATE;
  SELECT * INTO m FROM hoa.memberships WHERE id=mid AND community_id=hoa.tenant_id() FOR UPDATE;
  IF m.id IS NULL OR m.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'Membership not found' USING ERRCODE='22023'; END IF;
  IF m.role='community_admin' AND NOT EXISTS(SELECT FROM hoa.memberships WHERE community_id=m.community_id AND id<>mid AND role='community_admin' AND revoked_at IS NULL AND starts_at<=now() AND (ends_at IS NULL OR ends_at>now())) THEN
    RAISE EXCEPTION 'Verify a successor before revoking the last administrator' USING ERRCODE='22023';
  END IF;
  UPDATE hoa.memberships SET revoked_at=now() WHERE id=mid;
  INSERT INTO hoa.audit_events(community_id,actor_id,action,resource_id,details) VALUES(m.community_id,hoa.actor_id(),'membership.revoked',mid,jsonb_build_object('reason',reason));
END $$;

-- Force RLS on every shared table, including tables reached only by narrow definer functions.
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['users','sessions','oauth_attempts','rate_limits','organizations','organization_memberships','community_locations','registrations','address_exceptions','communities','memberships','management_assignments','role_permissions','audit_events'] LOOP
    EXECUTE format('ALTER TABLE hoa.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE hoa.%I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('CREATE POLICY internal_definer_access ON hoa.%I TO %I USING (true) WITH CHECK (true)',t,current_user);
  END LOOP;
END $$;
CREATE POLICY self ON hoa.users FOR SELECT TO hoa_runtime USING(id=hoa.actor_id());
CREATE POLICY registrations_read ON hoa.registrations FOR SELECT TO hoa_runtime USING(applicant_id=hoa.actor_id() OR hoa.is_platform_admin());
CREATE POLICY community_read ON hoa.communities FOR SELECT TO hoa_runtime USING(hoa.has_permission(id,'community.read'));
CREATE POLICY membership_read ON hoa.memberships FOR SELECT TO hoa_runtime USING(community_id=hoa.tenant_id() AND hoa.has_permission(community_id,'community.read') AND (user_id=hoa.actor_id() OR hoa.has_permission(community_id,'members.manage')));
CREATE POLICY audit_read ON hoa.audit_events FOR SELECT TO hoa_runtime USING((community_id=hoa.tenant_id() AND hoa.has_permission(community_id,'members.manage')) OR (community_id IS NULL AND hoa.is_platform_admin()));
GRANT SELECT ON hoa.users,hoa.registrations,hoa.communities,hoa.memberships,hoa.audit_events TO hoa_runtime;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA hoa TO hoa_runtime;
REVOKE ALL ON ALL TABLES IN SCHEMA hoa FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA hoa FROM PUBLIC;
