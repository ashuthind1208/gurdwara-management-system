import { Helmet } from 'react-helmet-async';
import { siteConfig } from '../../constants/siteConfig';
import { useBranding } from '../../context/BrandingContext';

const Seo = ({ title, description, canonical, image }) => {
  const { branding } = useBranding();
  const address = branding.address || siteConfig.contact.address;
  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'HinduTemple',
    name: siteConfig.name,
    url: siteConfig.baseUrl,
    telephone: siteConfig.contact.phone,
    email: siteConfig.contact.email,
    address: {
      '@type': 'PostalAddress',
      streetAddress: address
    }
  };

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content="website" />
      <meta property="og:image" content={image} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />
      <meta property="og:site_name" content={siteConfig.name} />
      <link rel="canonical" href={canonical} />
      <script type="application/ld+json">{JSON.stringify(organizationSchema)}</script>
    </Helmet>
  );
};

export default Seo;
