'use client';
import type {
  IdentityContext,
  OrganizationApplicationView,
  OrganizationDocumentPurpose,
} from '@nasj/contracts';
import { Building2, HandHeart } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '../ui/button';
import { useId, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { nasoujArt } from '../assistant/nasouj-assets';
import { Label } from '../ui/label';
import { Modal } from '../ui/modal';
import { Textarea } from '../ui/textarea';
import {
  ActionForm,
  Input,
  ResourceState,
  text,
  useFieldError,
  useResource,
} from '../workspace-ui';
import { FileField, chosenFile, pdfPayload } from './market-ui';
import styles from './market.module.css';

type ApplicantType = 'BUYER_BUSINESS' | 'ASSOCIATION';

function ApplicationFields({
  company,
  org,
}: {
  company: boolean;
  org?: OrganizationApplicationView;
}) {
  const descriptionId = useId();
  const errors = useFieldError('description');
  return (
    <>
      <Input
        name="name"
        label="Legal organization name"
        value={org?.name}
        minLength={2}
        maxLength={160}
        required
      />
      <Input
        name="registrationNumber"
        label={company ? 'Company registration number' : 'Association registration reference'}
        value={org?.registrationNumber}
        minLength={2}
        maxLength={80}
        required
      />
      <Input
        name="representativeName"
        label="Representative’s full name"
        value={org?.representativeName}
        minLength={2}
        maxLength={120}
        required
      />
      <Input name="region" label="Region" value={org?.region} maxLength={120} required />
      <Input
        name="contactEmail"
        label="Contact email"
        type="email"
        value={org?.contactEmail}
        maxLength={254}
        required
      />
      <Input
        name="contactPhone"
        label="Phone (optional)"
        type="tel"
        value={org?.contactPhone}
        maxLength={40}
      />
      <div className="field">
        <Label htmlFor={descriptionId}>
          What does the organization do? (at least 10 characters)
        </Label>
        <Textarea
          id={descriptionId}
          name="description"
          rows={3}
          defaultValue={org?.description}
          minLength={10}
          maxLength={3000}
          aria-invalid={errors.length > 0}
          aria-describedby={errors.length ? `${descriptionId}-error` : undefined}
          required
        />
        {errors.length > 0 && (
          <p id={`${descriptionId}-error`} className="field-error">
            {errors.join(' ')}
          </p>
        )}
      </div>
    </>
  );
}

const applicationDetails = (data: FormData) => ({
  name: text(data, 'name'),
  registrationNumber: text(data, 'registrationNumber'),
  representativeName: text(data, 'representativeName'),
  region: text(data, 'region'),
  description: text(data, 'description'),
  contactEmail: text(data, 'contactEmail'),
  contactPhone: text(data, 'contactPhone'),
});

function ApplicationDocument({
  organizationId,
  csrfToken,
  purpose,
  title,
  description,
  file,
  reload,
}: {
  organizationId: string;
  csrfToken: string;
  purpose: OrganizationDocumentPurpose;
  title: string;
  description: string;
  file: { filename: string; url: string } | null;
  reload: () => Promise<void>;
}) {
  return (
    <div>
      {file && (
        <p>
          Saved PDF:{' '}
          <a href={file.url} target="_blank" rel="noreferrer">
            {file.filename}
          </a>
        </p>
      )}
      <ActionForm
        key={file?.url ?? purpose}
        label={file ? 'Replace PDF' : 'Save PDF'}
        successMessage="PDF saved."
        onSuccess={reload}
        action={async (data) => {
          const pdf = chosenFile(data, 'proof');
          if (!pdf) throw new Error('Choose a PDF to upload.');
          await apiFetch('/api/v1/market/files', {
            method: 'POST',
            csrfToken,
            body: { purpose, organizationId, ...(await pdfPayload(pdf)) },
          });
        }}
      >
        <FileField
          name="proof"
          label={file ? `Replace ${title}` : title}
          accept=".pdf,application/pdf"
          hint={`${description} PDF, up to 4 MB.`}
          required
        />
      </ActionForm>
    </div>
  );
}

function Application({
  id,
  csrfToken,
  refresh,
}: {
  id: string;
  csrfToken: string;
  refresh: () => Promise<void>;
}) {
  const application = useResource<OrganizationApplicationView>(`/api/v1/organizations/${id}`);
  const [editing, setEditing] = useState(false);
  const org = application.data;
  const documents = org?.verificationDocuments;
  return (
    <>
      <ResourceState {...application} retry={application.reload} />
      {org && documents && (
        <>
          {org.approvalStatus === 'REJECTED' && (
            <p className="notice">
              NASJ requested changes:{' '}
              {org.approvalReason ?? 'Review your details and documents, then resubmit.'}
            </p>
          )}
          <section className={`panel ${styles.welcomeForm}`} aria-label="Organization details">
            <h2>1. Organization details</h2>
            {org.registrationNumber && !editing ? (
              <>
                <p>
                  {org.name} · {org.registrationNumber}
                </p>
                <p>Representative: {org.representativeName}</p>
                <Button type="button" variant="outline" onClick={() => setEditing(true)}>
                  Edit details
                </Button>
              </>
            ) : (
              <ActionForm
                label="Save details"
                onSuccess={async () => {
                  await application.reload();
                  setEditing(false);
                }}
                action={(data) =>
                  apiFetch(`/api/v1/organizations/${id}`, {
                    method: 'PATCH',
                    csrfToken,
                    body: applicationDetails(data),
                  })
                }
              >
                <ApplicationFields org={org} company={org.type === 'BUYER_BUSINESS'} />
              </ActionForm>
            )}
          </section>
          <section className={`panel ${styles.welcomeForm} ${styles.verificationDocuments}`}>
            <h2>2. Verification documents</h2>
            <p>
              NASJ reviewers use these documents to check your application. Please leave out
              personal ID numbers and bank details.
            </p>
            <ApplicationDocument
              organizationId={id}
              csrfToken={csrfToken}
              purpose="ORG_REGISTRATION"
              title="Organization registration"
              description="Provide a registration certificate or registry extract showing the legal name and registration reference."
              file={documents.registration}
              reload={application.reload}
            />
            <ApplicationDocument
              organizationId={id}
              csrfToken={csrfToken}
              purpose="ORG_PROOF"
              title="Representative authority"
              description="Provide a signed mandate, appointment letter, or registry extract showing that you may act for the organization."
              file={documents.authority}
              reload={application.reload}
            />
          </section>
          <section className={`panel ${styles.welcomeForm}`}>
            <h2>3. Send for review</h2>
            {org.registrationNumber && documents.registration && documents.authority && !editing ? (
              <ActionForm
                label={
                  org.approvalStatus === 'REJECTED' ? 'Resubmit application' : 'Send application'
                }
                onSuccess={refresh}
                action={() =>
                  apiFetch(`/api/v1/market/organizations/${id}/submit`, {
                    method: 'POST',
                    csrfToken,
                  })
                }
              />
            ) : (
              <p>Save the registration number and both PDFs to submit.</p>
            )}
          </section>
        </>
      )}
    </>
  );
}

export function Welcome({ csrfToken }: { csrfToken: string }) {
  const context = useResource<IdentityContext>('/api/v1/me/context');
  const [choice, setChoice] = useState<ApplicantType | null>(null);
  const others = context.data?.organizations.filter((org) => org.type !== 'INTERNAL') ?? [];
  const own = others.find((org) => org.approvalStatus !== 'REJECTED') ?? others[0];
  return (
    <div className={styles.welcome}>
      {!own && (
        <Image
          src={nasoujArt.poses.wave}
          alt="Nasouj, the NASJ assistant, waving"
          width={220}
          height={294}
          priority
        />
      )}
      <ResourceState {...context} retry={context.reload} />
      {context.data && !own && (
        <>
          <h1>Welcome to NASJ</h1>
          <p>Who are you joining us as?</p>
          <div className={styles.welcomeChoices}>
            <button type="button" onClick={() => setChoice('BUYER_BUSINESS')}>
              <Building2 size={28} aria-hidden="true" />
              <strong>Create a company</strong>
              <span>Order handmade gifts and products</span>
            </button>
            <button type="button" onClick={() => setChoice('ASSOCIATION')}>
              <HandHeart size={28} aria-hidden="true" />
              <strong>Create an association</strong>
              <span>Offer the crafts of the artisanes you work with</span>
            </button>
          </div>
        </>
      )}
      {own && (own.approvalStatus === 'DRAFT' || own.approvalStatus === 'REJECTED') && (
        <>
          <h1>
            {own.approvalStatus === 'DRAFT' ? 'Finish your application' : 'Update your application'}
          </h1>
          <Application key={own.id} id={own.id} csrfToken={csrfToken} refresh={context.reload} />
        </>
      )}
      {own?.approvalStatus === 'PENDING_REVIEW' && (
        <>
          <h1>Your application is in review</h1>
          <p>
            NASJ is reviewing {own.name}. Check back here for the decision or any requested changes.
          </p>
        </>
      )}
      {own?.approvalStatus === 'APPROVED' && (
        <>
          <h1>{own.name} is approved</h1>
          <Link href={context.data?.landingPath ?? '/dashboard'}>Open your workspace</Link>
        </>
      )}
      {own?.approvalStatus === 'SUSPENDED' && (
        <>
          <h1>{own.name} is suspended</h1>
          <p>Please contact the NASJ team.</p>
        </>
      )}
      <Modal
        open={choice !== null}
        onOpenChange={(open) => !open && setChoice(null)}
        title={choice === 'ASSOCIATION' ? 'Register your association' : 'Register your company'}
        description="Save your organization details first. Add your verification documents when the draft is ready."
      >
        <ActionForm
          label="Save and continue"
          successMessage="Application draft saved."
          onSuccess={async () => {
            setChoice(null);
            await context.reload();
          }}
          action={async (data) => {
            const details = applicationDetails(data);
            try {
              await apiFetch('/api/v1/organizations', {
                method: 'POST',
                csrfToken,
                body: { ...details, type: choice, country: 'TN' },
              });
            } catch (error) {
              // A connection can drop after the server has saved the draft. Check before offering a retry.
              if (!(error instanceof ApiError) || error.status < 500) throw error;
              const current = await apiFetch<IdentityContext>('/api/v1/me/context').catch(
                () => null,
              );
              if (
                current?.organizations.some(
                  (org) =>
                    org.type === choice &&
                    org.name === details.name &&
                    org.approvalStatus !== 'REJECTED',
                )
              )
                return;
              throw new Error(
                'We couldn’t confirm that your draft was saved. Your details are still here. Choose Save and continue to retry.',
              );
            }
          }}
        >
          <ApplicationFields company={choice === 'BUYER_BUSINESS'} />
        </ActionForm>
      </Modal>
    </div>
  );
}
