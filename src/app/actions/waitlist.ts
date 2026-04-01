'use server';

export async function joinWaitlist(formData: FormData) {
  const email = formData.get('email') as string;
  if (!email || !email.includes('@')) {
    return { error: 'Please enter a valid email.' };
  }

  try {
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.contacts.create({
      email,
      unsubscribed: false,
      segments: [{ id: process.env.RESEND_SEGMENT_ID! }],
    });
    return { success: true };
  } catch {
    return { error: 'Something went wrong. Please try again.' };
  }
}
