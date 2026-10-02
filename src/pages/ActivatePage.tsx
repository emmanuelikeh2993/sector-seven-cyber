import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getApplicationById, updateApplicationFields } from '../lib/storage';
import { ProspectApplication } from '../types';
import { 
  ShieldCheck, 
  Shield,
  ArrowLeft, 
  Lock, 
  FileText, 
  Check, 
  X, 
  AlertCircle, 
  CreditCard, 
  ExternalLink,
  Laptop,
  Cloud
} from 'lucide-react';

interface ActivatePageProps {
  onNavigate: (path: string) => void;
  applicationId?: string;
}

export const ActivatePage: React.FC<ActivatePageProps> = ({ onNavigate, applicationId }) => {
  const [app, setApp] = useState<ProspectApplication | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [agreed, setAgreed] = useState<boolean>(false);
  const [isAgreementModalOpen, setIsAgreementModalOpen] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    async function loadActivationData() {
      const targetId = applicationId || sessionStorage.getItem('sector_seven_last_application_id') || undefined;
      if (!targetId) {
        setLoading(false);
        return;
      }
      const data = await getApplicationById(targetId);
      setApp(data);
      setLoading(false);
    }
    loadActivationData();
  }, [applicationId]);

  if (loading) {
    return (
      <div className="min-h-screen pt-36 pb-24 flex items-center justify-center bg-[#F8FAFC]">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 rounded-full border-4 border-slate-200 border-t-[#0284C7] animate-spin mx-auto" />
          <p className="text-sm font-medium text-slate-500">
            Loading Service Agreement...
          </p>
        </div>
      </div>
    );
  }

  if (!app) {
    return (
      <div className="pt-36 pb-24 bg-[#F8FAFC] text-slate-900 min-h-screen flex items-center justify-center relative px-4">
        <div className="max-w-md w-full bg-white p-8 sm:p-10 rounded-3xl border border-slate-200 shadow-xl text-center space-y-6">
          <div className="w-14 h-14 rounded-2xl bg-sky-50 text-[#0284C7] flex items-center justify-center mx-auto border border-sky-100">
            <Shield className="w-7 h-7" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
              No Quote Pending Activation
            </h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              We couldn't locate an approved assessment ready for service activation. Please complete an initial security evaluation first.
            </p>
          </div>
          <button
            onClick={() => onNavigate('/apply')}
            className="w-full bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-bold py-3.5 rounded-full transition-all shadow-sm"
          >
            Start Security Assessment
          </button>
        </div>
      </div>
    );
  }

  const activeApp: ProspectApplication = app;
  const monthlyPrice = activeApp.calculated_monthly_price || 750;

  const handleAgreeAndPay = async () => {
    if (!agreed) {
      setErrorMessage('You must review and accept the Service Agreement before continuing to payment.');
      return;
    }

    setErrorMessage('');
    setIsProcessing(true);

    try {
      // 1. Record agreement timestamp & signer
      updateApplicationFields(activeApp.id, {
        agreement_signed: true,
        agreement_signed_at: new Date().toISOString(),
        agreement_signer_name: activeApp.contact_name,
        status: 'ACTIVATION STARTED',
      });

      // 2. Call serverless Stripe checkout session endpoint
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationId: activeApp.id,
          companyName: activeApp.company_name,
          email: activeApp.email,
          contactName: activeApp.contact_name,
          monthlyPrice: monthlyPrice,
          deviceCount: activeApp.device_count,
          cloudUserCount: activeApp.cloud_user_count,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok && (data.url || data.redirectUrl)) {
        // Redirect to live Stripe Checkout or local simulation
        window.location.href = data.url || data.redirectUrl;
        return;
      }

      setErrorMessage(
        data.error ||
        data.message ||
        'Unable to initiate secure checkout session. Please try again or contact our security team.'
      );
      setIsProcessing(false);
    } catch (err: any) {
      console.warn('Checkout redirection exception:', err);
      setErrorMessage('A connection error occurred while initiating checkout. Please try again.');
      setIsProcessing(false);
    }
  };

  return (
    <div className="pt-32 pb-24 bg-[#F8FAFC] text-slate-900 min-h-screen relative overflow-hidden">
      
      {/* Background Soft Glow */}
      <div className="absolute top-28 left-1/2 -translate-x-1/2 w-[700px] h-[500px] bg-sky-100/40 rounded-full blur-[160px] pointer-events-none" />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-left">
        
        {/* Back Link */}
        <button
          onClick={() => onNavigate(`/quote?id=${activeApp.id}`)}
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-[#0284C7] mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Quote</span>
        </button>

        {/* Page Header */}
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-8 space-y-3 border-b border-slate-200 pb-6"
        >
          <div className="inline-flex items-center gap-2 bg-sky-50 text-[#0284C7] border border-sky-200 px-4 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider">
            <ShieldCheck className="w-4 h-4" />
            <span>Activation & Service Agreement</span>
          </div>
          
          <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 tracking-tight">
            Activate Your Protection
          </h1>
          
          <p className="text-slate-600 text-base sm:text-lg leading-relaxed">
            Review your protection schedule, authorize the service agreement, and complete secure payment to initiate security onboarding.
          </p>
        </motion.div>

        {/* ACTIVATION DETAILS CARD (Futuristic, Glassy, Clean) */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="bg-white/90 backdrop-blur-xl rounded-3xl p-6 sm:p-10 border border-slate-200 shadow-[0_20px_50px_rgba(0,0,0,0.05)] relative overflow-hidden space-y-8"
        >
          {/* Core Specifications Table */}
          <div className="space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#0284C7]">
              Service Specification Schedule
            </h2>

            <div className="divide-y divide-slate-100 rounded-2xl bg-slate-50/80 border border-slate-200/80 p-5 text-sm">
              <div className="flex justify-between py-3">
                <span className="text-slate-500 font-medium">Company:</span>
                <span className="font-extrabold text-slate-900">{activeApp.company_name}</span>
              </div>
              <div className="flex justify-between py-3">
                <span className="text-slate-500 font-medium">Service:</span>
                <span className="font-bold text-[#0284C7]">Sector Seven Cyber Protection</span>
              </div>
              <div className="flex justify-between py-3">
                <span className="text-slate-500 font-medium">Protected Devices:</span>
                <span className="font-bold text-slate-900">{activeApp.device_count} Laptops / Desktops</span>
              </div>
              <div className="flex justify-between py-3">
                <span className="text-slate-500 font-medium">Protected Cloud Users:</span>
                <span className="font-bold text-slate-900">{activeApp.cloud_user_count} Identity Accounts</span>
              </div>
              <div className="flex justify-between items-center py-4 border-t-2 border-slate-300">
                <span className="text-slate-900 font-bold">Monthly Service Total:</span>
                <span className="text-3xl font-extrabold text-slate-900">
                  ${monthlyPrice}<span className="text-xs font-normal text-slate-500 ml-1">/ month</span>
                </span>
              </div>
            </div>
          </div>

          {/* VIEW SERVICE AGREEMENT BUTTON */}
          <div className="flex items-center justify-between p-4 rounded-2xl bg-sky-50 border border-sky-200">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-[#0284C7]" />
              <div>
                <h4 className="text-sm font-bold text-slate-900">Sector Seven Cyber LLC Service Agreement</h4>
                <p className="text-xs text-slate-600">Standard Master Services Agreement & SOC Terms</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsAgreementModalOpen(true)}
              className="px-4 py-2 rounded-full bg-white hover:bg-slate-100 text-[#0284C7] font-bold text-xs border border-sky-300 shadow-xs transition-colors flex items-center gap-1.5"
            >
              <span>View Service Agreement</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* MANDATORY LEGAL CHECKBOX */}
          <div className="space-y-3">
            <label className="flex items-start gap-3.5 p-4 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50/60 cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => {
                  setAgreed(e.target.checked);
                  if (errorMessage) setErrorMessage('');
                }}
                className="w-5 h-5 mt-0.5 text-[#0284C7] border-slate-300 rounded focus:ring-[#0284C7] cursor-pointer shrink-0"
              />
              <span className="text-xs sm:text-sm text-slate-700 leading-relaxed font-normal">
                I have read and agree to the <strong>Sector Seven Cyber LLC Service Agreement</strong> and authorize the recurring monthly charge displayed above. <span className="text-red-500">*</span>
              </span>
            </label>

            {errorMessage && (
              <p className="text-xs text-red-600 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>{errorMessage}</span>
              </p>
            )}
          </div>

          {/* MANDATORY QUANTITY ADJUSTMENT NOTICE (Document Section 17) */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 leading-relaxed">
            <p>
              <strong>Notice Regarding Environment Scale:</strong> Pricing is based on the information and quantities provided during your assessment. If the number of devices or cloud users requiring protection differs during onboarding or changes during the service period, your service plan and recurring monthly charge may be adjusted accordingly.
            </p>
          </div>

          {/* AGREE & PAY BUTTON */}
          <div className="space-y-4 pt-2">
            <button
              onClick={handleAgreeAndPay}
              disabled={isProcessing}
              className="w-full btn-primary bg-[#0284C7] hover:bg-[#0369A1] text-white font-bold text-sm py-4 px-8 rounded-full shadow-md hover:shadow-lg flex items-center justify-center gap-3 transition-all duration-200 hover:scale-[1.01] disabled:opacity-50 disabled:cursor-not-allowed group"
            >
              <CreditCard className="w-4 h-4 text-sky-200" />
              <span>{isProcessing ? 'Initiating Stripe Checkout...' : 'Agree & Pay'}</span>
            </button>

            <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-[#0284C7]" />
                Powered by Stripe Checkout
              </span>
              <span>Recurring Monthly Subscription</span>
              <span>Cancel or Adjust Anytime</span>
            </div>
          </div>

        </motion.div>

      </div>

      {/* SERVICE AGREEMENT MODAL DIALOG */}
      <AnimatePresence>
        {isAgreementModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden"
            >
              {/* Modal Header */}
              <div className="p-6 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-[#0284C7]" />
                  <h3 className="font-extrabold text-slate-900 text-base">
                    Sector Seven Cyber LLC — Service Agreement
                  </h3>
                </div>
                <button
                  onClick={() => setIsAgreementModalOpen(false)}
                  className="p-1 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Scrollable Body */}
              <div className="p-6 overflow-y-auto space-y-4 text-xs sm:text-sm text-slate-700 leading-relaxed">
                <p className="text-xs text-slate-500">
                  Effective Date: {new Date().toLocaleDateString()} | Document Version: 2026-V2.0
                </p>

                <h4 className="font-bold text-slate-900">1. Scope of Services</h4>
                <p>
                  Sector Seven Cyber LLC ("Provider") agrees to provide the client organization ("Client") with <strong>Cloud & Endpoint Managed Detection & Response (MDR)</strong>. This service includes 24/7 Security Operations Center (SOC) threat detection, active containment, endpoint detection and response (EDR), cloud identity monitoring, asset inventory, and continuous security posture rating.
                </p>

                <h4 className="font-bold text-slate-900">2. Recurring Monthly Subscription & Billing</h4>
                <p>
                  Client authorizes Provider to initiate recurring monthly subscription charges to Client’s designated payment method via Stripe. Charges correspond to the approved protected environment tier. Pricing is determined by the quantities provided during Client assessment. If actual device or cloud identity counts differ during technical onboarding or change during the term of service, Provider reserves the right to adjust the monthly service plan and billing rate accordingly upon written notice.
                </p>

                <h4 className="font-bold text-slate-900">3. Active Response Authorization</h4>
                <p>
                  Client authorizes Provider's SOC analysts and automated telemetry agents to perform active containment actions on protected devices and cloud tenants when high-severity malicious vectors, ransomware execution, or unauthorized account compromises are detected.
                </p>

                <h4 className="font-bold text-slate-900">4. Confidentiality & Data Protection</h4>
                <p>
                  Provider treats all Client telemetry, infrastructure topologies, and business data with strict confidentiality, maintaining compliance with applicable Georgia and federal privacy standards. Telemetry is utilized solely for active threat detection and defense.
                </p>

                <h4 className="font-bold text-slate-900">5. Termination & Subscription Management</h4>
                <p>
                  Services are provided on a month-to-month subscription basis. Either party may cancel recurring billing with 30 days written notice prior to the subsequent monthly billing cycle.
                </p>
              </div>

              {/* Modal Footer */}
              <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  Official Sector Seven Cyber Legal Document
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setAgreed(true);
                    setIsAgreementModalOpen(false);
                  }}
                  className="px-5 py-2.5 rounded-full bg-[#0284C7] hover:bg-[#0369A1] text-white font-bold text-xs transition-colors flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Accept & Close</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};
